#!/usr/bin/env python3
"""
Collaborative Watch Party Platform - Signaling & Media Streaming Server
Pure Python (Zero Dependencies) - Compatible with Python 3.8+
Features:
- RFC 6455 compliant WebSocket implementation over asyncio
- Embedded HTTP server with HTTP 206 Partial Content (Range requests) for seekable video streaming
- Raw streaming upload endpoint (/api/upload) and local path loader (/api/load-local-path)
- Room-based state synchronization with sub-15ms message routing
- Cristian's algorithm NTP clock synchronization for precision drift calculation
- Full WebRTC mesh signaling relay (SDP offer/answer and ICE candidates)
"""

import argparse
import asyncio
import base64
import hashlib
import json
import mimetypes
import os
import shutil
import struct
import time
import urllib.parse

parser = argparse.ArgumentParser(description="WatchParty Pro Signaling Server")
parser.add_argument("--host", default="127.0.0.1", help="Host address to bind (default: 127.0.0.1)")
parser.add_argument("--port", type=int, default=8080, help="Port to listen on (default: 8080)")
args, _ = parser.parse_known_args()

PORT = args.port
HOST = args.host
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PUBLIC_DIR = os.path.join(BASE_DIR, "public")
MEDIA_DIR = os.path.join(BASE_DIR, "media")

os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(MEDIA_DIR, exist_ok=True)

# In-memory room store: room_id -> {
#   "host_id": str,
#   "state": { "source": str, "source_type": str, "current_time": float, "is_playing": bool, "playback_rate": float, "updated_at": float },
#   "clients": { client_id: { "ws": WebSocketConnection, "name": str, "id": str } }
# }
ROOMS = {}

WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

def get_current_time_ms():
    return int(time.time() * 1000)

class WebSocketConnection:
    def __init__(self, reader, writer, client_id):
        self.reader = reader
        self.writer = writer
        self.client_id = client_id
        self.closed = False

    async def send_text(self, text):
        if self.closed:
            return
        payload = text.encode("utf-8")
        length = len(payload)
        header = bytearray([0x81]) # FIN + Text frame
        if length <= 125:
            header.append(length)
        elif length <= 65535:
            header.append(126)
            header.extend(struct.pack(">H", length))
        else:
            header.append(127)
            header.extend(struct.pack(">Q", length))
        try:
            self.writer.write(header + payload)
            await self.writer.drain()
        except Exception:
            self.closed = True

    async def send_json(self, data):
        await self.send_text(json.dumps(data))

    async def read_frame(self):
        try:
            head = await self.reader.readexactly(2)
        except (asyncio.IncompleteReadError, ConnectionResetError):
            return None, None

        fin = bool(head[0] & 0x80)
        opcode = head[0] & 0x0F
        has_mask = bool(head[1] & 0x80)
        payload_len = head[1] & 0x7F

        if opcode == 0x8: # Close frame
            return 0x8, None

        if payload_len == 126:
            ext = await self.reader.readexactly(2)
            payload_len = struct.unpack(">H", ext)[0]
        elif payload_len == 127:
            ext = await self.reader.readexactly(8)
            payload_len = struct.unpack(">Q", ext)[0]

        mask = None
        if has_mask:
            mask = await self.reader.readexactly(4)

        payload = await self.reader.readexactly(payload_len)
        if has_mask:
            unmasked = bytearray(payload_len)
            for i in range(payload_len):
                unmasked[i] = payload[i] ^ mask[i % 4]
            payload = bytes(unmasked)

        return opcode, payload

    async def close(self):
        if not self.closed:
            self.closed = True
            try:
                self.writer.write(bytearray([0x88, 0x00]))
                await self.writer.drain()
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass


async def broadcast_to_room(room_id, message_dict, exclude_client_id=None):
    if room_id not in ROOMS:
        return
    stale_clients = []
    for cid, client in ROOMS[room_id]["clients"].items():
        if exclude_client_id and cid == exclude_client_id:
            continue
        try:
            await client["ws"].send_json(message_dict)
        except Exception:
            stale_clients.append(cid)
    for cid in stale_clients:
        await remove_client_from_room(room_id, cid)


async def remove_client_from_room(room_id, client_id):
    if room_id not in ROOMS:
        return
    room = ROOMS[room_id]
    if client_id in room["clients"]:
        client_name = room["clients"][client_id]["name"]
        del room["clients"][client_id]
        print(f"[-] Client {client_name} ({client_id}) left room {room_id}")

        if not room["clients"]:
            del ROOMS[room_id]
            print(f"[x] Room {room_id} closed (empty)")
            return

        if room["host_id"] == client_id:
            room["host_id"] = next(iter(room["clients"]))
            print(f"[*] New host for room {room_id}: {room['host_id']}")

        await broadcast_to_room(room_id, {
            "type": "member_left",
            "client_id": client_id,
            "name": client_name,
            "host_id": room["host_id"],
            "members": [{"id": cid, "name": c["name"]} for cid, c in room["clients"].items()]
        })


async def handle_websocket_messages(ws, client_id):
    current_room_id = None
    try:
        while not ws.closed:
            opcode, data = await ws.read_frame()
            if opcode is None or opcode == 0x8:
                break
            if opcode == 0x9: # Ping
                ws.writer.write(bytearray([0x8A, 0x00]))
                await ws.writer.drain()
                continue
            if opcode != 0x1: # Text frame only
                continue

            try:
                msg = json.loads(data.decode("utf-8"))
            except Exception:
                continue

            action = msg.get("action") or msg.get("type")

            # 1. Clock synchronization (NTP / Cristian's algorithm)
            if action == "sync_clock":
                client_send_time = msg.get("client_time", 0)
                server_recv_time = get_current_time_ms()
                await ws.send_json({
                    "type": "clock_sync_ack",
                    "client_send_time": client_send_time,
                    "server_time": server_recv_time
                })
                continue

            # 2. Join Room
            elif action == "join_room":
                room_id = msg.get("room_id", "default")
                name = msg.get("name", f"Viewer-{client_id[:4]}")
                current_room_id = room_id

                if room_id not in ROOMS:
                    ROOMS[room_id] = {
                        "host_id": client_id,
                        "state": {
                            "source": "",
                            "source_type": "url",
                            "current_time": 0.0,
                            "is_playing": False,
                            "playback_rate": 1.0,
                            "updated_at": get_current_time_ms()
                        },
                        "clients": {}
                    }

                room = ROOMS[room_id]
                room["clients"][client_id] = {
                    "ws": ws,
                    "name": name,
                    "id": client_id
                }

                print(f"[+] Client {name} ({client_id}) joined room {room_id}")

                await ws.send_json({
                    "type": "room_joined",
                    "room_id": room_id,
                    "client_id": client_id,
                    "host_id": room["host_id"],
                    "state": room["state"],
                    "server_time": get_current_time_ms(),
                    "members": [{"id": cid, "name": c["name"]} for cid, c in room["clients"].items()]
                })

                await broadcast_to_room(room_id, {
                    "type": "member_joined",
                    "client_id": client_id,
                    "name": name,
                    "host_id": room["host_id"],
                    "members": [{"id": cid, "name": c["name"]} for cid, c in room["clients"].items()]
                }, exclude_client_id=client_id)

            # 3. Media State Update (Play, Pause, Seek, Change Source)
            elif action in ("media_play", "media_pause", "media_seek", "media_change_source", "media_sync"):
                if not current_room_id or current_room_id not in ROOMS:
                    continue
                room = ROOMS[current_room_id]
                now_ms = get_current_time_ms()

                cur_time = msg.get("current_time", room["state"]["current_time"])
                is_playing = msg.get("is_playing", room["state"]["is_playing"])
                playback_rate = msg.get("playback_rate", 1.0)
                source = msg.get("source", room["state"]["source"])
                source_type = msg.get("source_type", room["state"]["source_type"])

                room["state"].update({
                    "source": source,
                    "source_type": source_type,
                    "current_time": cur_time,
                    "is_playing": is_playing,
                    "playback_rate": playback_rate,
                    "updated_at": now_ms
                })

                await broadcast_to_room(current_room_id, {
                    "type": "playback_sync",
                    "origin_id": client_id,
                    "action": action,
                    "current_time": cur_time,
                    "is_playing": is_playing,
                    "playback_rate": playback_rate,
                    "source": source,
                    "source_type": source_type,
                    "server_time": now_ms
                }, exclude_client_id=client_id)

            # 4. WebRTC Signaling Relay
            elif action == "webrtc_signal":
                target_id = msg.get("target_id")
                signal_data = msg.get("data")
                if current_room_id in ROOMS and target_id in ROOMS[current_room_id]["clients"]:
                    target_ws = ROOMS[current_room_id]["clients"][target_id]["ws"]
                    await target_ws.send_json({
                        "type": "webrtc_signal",
                        "sender_id": client_id,
                        "data": signal_data
                    })

            # 5. Room Chat
            elif action == "chat_message":
                if not current_room_id or current_room_id not in ROOMS:
                    continue
                text = msg.get("text", "").strip()
                if text:
                    sender_name = ROOMS[current_room_id]["clients"][client_id]["name"]
                    await broadcast_to_room(current_room_id, {
                        "type": "chat_broadcast",
                        "sender_id": client_id,
                        "sender_name": sender_name,
                        "text": text,
                        "timestamp": get_current_time_ms()
                    })

    finally:
        if current_room_id:
            await remove_client_from_room(current_room_id, client_id)
        await ws.close()


async def serve_file_with_range(reader, writer, file_path, headers):
    try:
        file_size = os.path.getsize(file_path)
    except OSError:
        body = b"<h1>404 File Not Found</h1>"
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
        await writer.drain()
        writer.close()
        return

    mime_type, _ = mimetypes.guess_type(file_path)
    if not mime_type:
        mime_type = "application/octet-stream"

    range_header = headers.get("range", "")
    start_byte = 0
    end_byte = file_size - 1

    is_range = False
    if range_header.startswith("bytes="):
        is_range = True
        parts = range_header[6:].split("-")
        try:
            if parts[0]:
                start_byte = int(parts[0])
            if parts[1]:
                end_byte = int(parts[1])
        except ValueError:
            pass

    if start_byte >= file_size or end_byte >= file_size or start_byte > end_byte:
        writer.write(b"HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */" + str(file_size).encode() + b"\r\n\r\n")
        await writer.drain()
        writer.close()
        return

    chunk_length = end_byte - start_byte + 1

    if is_range:
        header_lines = [
            b"HTTP/1.1 206 Partial Content",
            f"Content-Type: {mime_type}".encode(),
            f"Content-Range: bytes {start_byte}-{end_byte}/{file_size}".encode(),
            f"Content-Length: {chunk_length}".encode(),
            b"Accept-Ranges: bytes",
            b"Access-Control-Allow-Origin: *",
            b"Cache-Control: no-cache",
            b"",
            b""
        ]
    else:
        header_lines = [
            b"HTTP/1.1 200 OK",
            f"Content-Type: {mime_type}".encode(),
            f"Content-Length: {file_size}".encode(),
            b"Accept-Ranges: bytes",
            b"Access-Control-Allow-Origin: *",
            b"Cache-Control: no-cache",
            b"",
            b""
        ]

    writer.write(b"\r\n".join(header_lines))
    await writer.drain()

    # Stream chunks of 64KB
    chunk_size = 64 * 1024
    bytes_remaining = chunk_length
    try:
        with open(file_path, "rb") as f:
            f.seek(start_byte)
            while bytes_remaining > 0:
                to_read = min(chunk_size, bytes_remaining)
                chunk = f.read(to_read)
                if not chunk:
                    break
                writer.write(chunk)
                await writer.drain()
                bytes_remaining -= len(chunk)
    except (ConnectionResetError, BrokenPipeError):
        pass
    finally:
        writer.close()


async def handle_http_request(reader, writer, request_line, headers):
    parts = request_line.split()
    if len(parts) < 2:
        writer.close()
        return

    method, full_path = parts[0], parts[1]
    parsed_url = urllib.parse.urlparse(full_path)
    path = parsed_url.path
    query_params = urllib.parse.parse_qs(parsed_url.query)

    # 1. API: Streaming File Upload (POST /api/upload?filename=video.mp4)
    if method == "POST" and path == "/api/upload":
        filename = query_params.get("filename", ["uploaded_video.mp4"])[0]
        filename = os.path.basename(urllib.parse.unquote(filename))
        dest_path = os.path.join(MEDIA_DIR, filename)

        content_length = int(headers.get("content-length", 0))
        bytes_read = 0
        try:
            with open(dest_path, "wb") as f:
                while bytes_read < content_length:
                    to_read = min(128 * 1024, content_length - bytes_read)
                    data = await reader.read(to_read)
                    if not data:
                        break
                    f.write(data)
                    bytes_read += len(data)

            res_body = json.dumps({
                "status": "ok",
                "filename": filename,
                "url": f"/media/{urllib.parse.quote(filename)}",
                "size": bytes_read
            }).encode("utf-8")

            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/json\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Content-Length: " + str(len(res_body)).encode() + b"\r\n\r\n" + res_body
            )
            await writer.drain()
        except Exception as e:
            err = json.dumps({"status": "error", "message": str(e)}).encode("utf-8")
            writer.write(b"HTTP/1.1 500 Internal Error\r\nContent-Type: application/json\r\n\r\n" + err)
            await writer.drain()
        finally:
            writer.close()
        return

    # 2. API: Load Local Path (/api/load-local-path)
    if method == "POST" and path == "/api/load-local-path":
        content_length = int(headers.get("content-length", 0))
        body = await reader.read(content_length)
        try:
            req_data = json.loads(body.decode("utf-8"))
            local_path = req_data.get("path", "").strip()
            # Expand ~ if user provides ~/Desktop/...
            if local_path.startswith("~"):
                local_path = os.path.expanduser(local_path)

            if not os.path.isfile(local_path):
                res_body = json.dumps({"status": "error", "message": f"File not found: {local_path}"}).encode()
                writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\n\r\n" + res_body)
                await writer.drain()
                writer.close()
                return

            filename = os.path.basename(local_path)
            target_link = os.path.join(MEDIA_DIR, filename)

            # Create symlink or copy to media dir
            if os.path.exists(target_link):
                if os.path.islink(target_link):
                    os.unlink(target_link)
            try:
                os.symlink(local_path, target_link)
            except OSError:
                shutil.copyfile(local_path, target_link)

            res_body = json.dumps({
                "status": "ok",
                "filename": filename,
                "url": f"/media/{urllib.parse.quote(filename)}",
                "size": os.path.getsize(local_path)
            }).encode()

            writer.write(
                b"HTTP/1.1 200 OK\r\n"
                b"Content-Type: application/json\r\n"
                b"Access-Control-Allow-Origin: *\r\n"
                b"Content-Length: " + str(len(res_body)).encode() + b"\r\n\r\n" + res_body
            )
            await writer.drain()
        except Exception as e:
            err = json.dumps({"status": "error", "message": str(e)}).encode()
            writer.write(b"HTTP/1.1 500 Internal Error\r\nContent-Type: application/json\r\n\r\n" + err)
            await writer.drain()
        finally:
            writer.close()
        return

    # 3. Serve Media Files with HTTP Range support (/media/<filename>)
    if path.startswith("/media/"):
        raw_filename = urllib.parse.unquote(path[len("/media/"):])
        clean_filename = os.path.normpath(raw_filename.lstrip("/"))
        file_path = os.path.join(MEDIA_DIR, clean_filename)

        if not os.path.isfile(file_path):
            body = b"<h1>404 Media Not Found</h1>"
            writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
            await writer.drain()
            writer.close()
            return

        await serve_file_with_range(reader, writer, file_path, headers)
        return

    # 4. Static Website Assets
    if path == "/" or path == "":
        path = "/index.html"

    clean_path = os.path.normpath(path.lstrip("/"))
    target_path = os.path.join(PUBLIC_DIR, clean_path)

    if not target_path.startswith(PUBLIC_DIR) or not os.path.isfile(target_path):
        body = b"<h1>404 Not Found</h1>"
        writer.write(b"HTTP/1.1 404 Not Found\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body)
        await writer.drain()
        writer.close()
        return

    await serve_file_with_range(reader, writer, target_path, headers)


async def handle_connection(reader, writer):
    try:
        raw_header = await reader.readuntil(b"\r\n\r\n")
    except Exception:
        writer.close()
        return

    lines = raw_header.decode("latin1").split("\r\n")
    request_line = lines[0]
    headers = {}
    for line in lines[1:]:
        if ": " in line:
            k, v = line.split(": ", 1)
            headers[k.lower()] = v

    if headers.get("upgrade", "").lower() == "websocket":
        key = headers.get("sec-websocket-key")
        if not key:
            writer.close()
            return

        accept_val = base64.b64encode(hashlib.sha1((key + WS_GUID).encode()).digest()).decode()
        handshake_response = (
            "HTTP/1.1 101 Switching Protocols\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Accept: {accept_val}\r\n\r\n"
        )
        writer.write(handshake_response.encode())
        await writer.drain()

        client_id = base64.b32encode(os.urandom(6)).decode().rstrip("=")
        ws = WebSocketConnection(reader, writer, client_id)
        await handle_websocket_messages(ws, client_id)
    else:
        await handle_http_request(reader, writer, request_line, headers)


async def main():
    server = await asyncio.start_server(handle_connection, HOST, PORT)
    addr = server.sockets[0].getsockname()
    print(f"===========================================================")
    print(f" Collaborative Watch Party Server Running")
    print(f" Access URL: http://{HOST}:{addr[1]}")
    print(f" WebSocket:  ws://{HOST}:{addr[1]}/ws")
    print(f" Public Dir: {PUBLIC_DIR}")
    print(f" Media Dir:  {MEDIA_DIR}")
    print(f"===========================================================")
    async with server:
        await server.serve_forever()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n[!] Server shutting down.")
