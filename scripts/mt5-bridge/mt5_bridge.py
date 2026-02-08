#!/usr/bin/env python3
import json
import logging
import os
import threading
import time
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:
    import MetaTrader5 as mt5
except Exception as exc:  # pragma: no cover - runtime import
    mt5 = None
    MT5_IMPORT_ERROR = exc
else:
    MT5_IMPORT_ERROR = None


DEFAULT_HOST = os.environ.get("MT5_BRIDGE_HOST", "127.0.0.1")
DEFAULT_PORT = int(os.environ.get("MT5_BRIDGE_PORT", "5001"))
TERMINAL_PATH = os.environ.get("MT5_TERMINAL_PATH")

LOG_LEVEL = os.environ.get("MT5_BRIDGE_LOG_LEVEL", "INFO").upper()
logging.basicConfig(level=LOG_LEVEL)
logger = logging.getLogger("mt5-bridge")

LOCK = threading.Lock()

ORDER_TYPE_MAP = {
    "buy": "ORDER_TYPE_BUY",
    "sell": "ORDER_TYPE_SELL",
    "buy_limit": "ORDER_TYPE_BUY_LIMIT",
    "sell_limit": "ORDER_TYPE_SELL_LIMIT",
    "buy_stop": "ORDER_TYPE_BUY_STOP",
    "sell_stop": "ORDER_TYPE_SELL_STOP",
    "buy_stop_limit": "ORDER_TYPE_BUY_STOP_LIMIT",
    "sell_stop_limit": "ORDER_TYPE_SELL_STOP_LIMIT",
}

ORDER_ACTION_MAP = {
    "market": "TRADE_ACTION_DEAL",
    "pending": "TRADE_ACTION_PENDING",
}

ORDER_TIME_MAP = {
    "gtd": "ORDER_TIME_GTD",
    "gtc": "ORDER_TIME_GTC",
    "day": "ORDER_TIME_DAY",
    "specify": "ORDER_TIME_SPECIFIED",
    "specify_day": "ORDER_TIME_SPECIFIED_DAY",
}

ORDER_FILLING_MAP = {
    "fok": "ORDER_FILLING_FOK",
    "ioc": "ORDER_FILLING_IOC",
    "return": "ORDER_FILLING_RETURN",
}

TIMEFRAME_MAP = {
    "M1": "TIMEFRAME_M1",
    "M2": "TIMEFRAME_M2",
    "M3": "TIMEFRAME_M3",
    "M4": "TIMEFRAME_M4",
    "M5": "TIMEFRAME_M5",
    "M6": "TIMEFRAME_M6",
    "M10": "TIMEFRAME_M10",
    "M12": "TIMEFRAME_M12",
    "M15": "TIMEFRAME_M15",
    "M20": "TIMEFRAME_M20",
    "M30": "TIMEFRAME_M30",
    "H1": "TIMEFRAME_H1",
    "H2": "TIMEFRAME_H2",
    "H3": "TIMEFRAME_H3",
    "H4": "TIMEFRAME_H4",
    "H6": "TIMEFRAME_H6",
    "H8": "TIMEFRAME_H8",
    "H12": "TIMEFRAME_H12",
    "D1": "TIMEFRAME_D1",
    "W1": "TIMEFRAME_W1",
    "MN1": "TIMEFRAME_MN1",
}


def ensure_mt5_initialized():
    if mt5 is None:
        raise RuntimeError(f"MetaTrader5 import failed: {MT5_IMPORT_ERROR}")
    if mt5.initialize(path=TERMINAL_PATH) is False:
        raise RuntimeError(f"mt5.initialize() failed: {mt5.last_error()}")


def mt5_shutdown():
    if mt5 is None:
        return
    mt5.shutdown()


def json_response(handler, status, payload):
    body = json.dumps(payload).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def parse_body(handler):
    length = int(handler.headers.get("Content-Length", "0") or "0")
    if length <= 0:
        return None
    raw = handler.rfile.read(length)
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        return None


def to_dict(obj):
    if obj is None:
        return None
    if hasattr(obj, "_asdict"):
        return obj._asdict()
    if isinstance(obj, dict):
        return obj
    return obj.__dict__


class Mt5BridgeHandler(BaseHTTPRequestHandler):
    server_version = "MT5Bridge/1.0"

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            return self.handle_health()
        if parsed.path == "/openapi.json":
            return self.handle_openapi()
        if parsed.path == "/account":
            return self.handle_account()
        if parsed.path == "/positions":
            return self.handle_positions(parsed.query)
        if parsed.path == "/orders":
            return self.handle_orders(parsed.query)
        if parsed.path == "/ticks":
            return self.handle_ticks(parsed.query)
        if parsed.path == "/rates":
            return self.handle_rates(parsed.query)
        if parsed.path == "/symbols":
            return self.handle_symbols(parsed.query)
        return json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == "/initialize":
            return self.handle_initialize()
        if parsed.path == "/order":
            return self.handle_order()
        if parsed.path == "/position/close":
            return self.handle_position_close()
        if parsed.path == "/position/modify":
            return self.handle_position_modify()
        if parsed.path == "/shutdown":
            return self.handle_shutdown()
        return json_response(self, HTTPStatus.NOT_FOUND, {"error": "not found"})

    def log_message(self, fmt, *args):
        logger.info("%s - %s", self.address_string(), fmt % args)

    def handle_health(self):
        status = {
            "ok": True,
            "mt5_loaded": mt5 is not None,
            "terminal_path": TERMINAL_PATH,
            "timestamp": int(time.time()),
        }
        if mt5 is None:
            status["ok"] = False
            status["error"] = str(MT5_IMPORT_ERROR)
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, status)
        with LOCK:
            initialized = mt5.initialize(path=TERMINAL_PATH)
            if not initialized:
                status["ok"] = False
                status["error"] = str(mt5.last_error())
                return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, status)
            info = mt5.terminal_info()
            status["terminal"] = to_dict(info)
        return json_response(self, HTTPStatus.OK, status)

    def handle_openapi(self):
        spec = {
            "openapi": "3.0.0",
            "info": {"title": "MT5 Bridge", "version": "1.0.0"},
            "paths": {
                "/health": {"get": {"summary": "Health check"}},
                "/openapi.json": {"get": {"summary": "OpenAPI spec"}},
                "/initialize": {"post": {"summary": "Initialize MT5"}},
                "/shutdown": {"post": {"summary": "Shutdown MT5"}},
                "/account": {"get": {"summary": "Account info"}},
                "/positions": {"get": {"summary": "List positions"}},
                "/orders": {"get": {"summary": "List orders"}},
                "/ticks": {"get": {"summary": "Last tick"}},
                "/rates": {"get": {"summary": "Rates"}},
                "/symbols": {"get": {"summary": "Symbols"}},
                "/order": {"post": {"summary": "Execute order"}},
                "/position/close": {"post": {"summary": "Close position"}},
                "/position/modify": {"post": {"summary": "Modify position"}},
            },
        }
        return json_response(self, HTTPStatus.OK, spec)

    def handle_initialize(self):
        if mt5 is None:
            return json_response(
                self,
                HTTPStatus.SERVICE_UNAVAILABLE,
                {"ok": False, "error": str(MT5_IMPORT_ERROR)},
            )
        with LOCK:
            ok = mt5.initialize(path=TERMINAL_PATH)
            if not ok:
                return json_response(
                    self, HTTPStatus.SERVICE_UNAVAILABLE, {"ok": False, "error": mt5.last_error()}
                )
        return json_response(self, HTTPStatus.OK, {"ok": True})

    def handle_shutdown(self):
        if mt5 is None:
            return json_response(self, HTTPStatus.OK, {"ok": True})
        with LOCK:
            mt5_shutdown()
        return json_response(self, HTTPStatus.OK, {"ok": True})

    def handle_account(self):
        try:
            with LOCK:
                ensure_mt5_initialized()
                info = mt5.account_info()
            return json_response(self, HTTPStatus.OK, {"account": to_dict(info)})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_positions(self, query):
        params = parse_qs(query)
        symbol = params.get("symbol", [None])[0]
        try:
            with LOCK:
                ensure_mt5_initialized()
                positions = mt5.positions_get(symbol=symbol) if symbol else mt5.positions_get()
            items = [to_dict(p) for p in (positions or [])]
            return json_response(self, HTTPStatus.OK, {"positions": items})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_orders(self, query):
        params = parse_qs(query)
        symbol = params.get("symbol", [None])[0]
        try:
            with LOCK:
                ensure_mt5_initialized()
                orders = mt5.orders_get(symbol=symbol) if symbol else mt5.orders_get()
            items = [to_dict(o) for o in (orders or [])]
            return json_response(self, HTTPStatus.OK, {"orders": items})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_ticks(self, query):
        params = parse_qs(query)
        symbol = params.get("symbol", [None])[0]
        if not symbol:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "symbol required"})
        try:
            with LOCK:
                ensure_mt5_initialized()
                tick = mt5.symbol_info_tick(symbol)
            return json_response(self, HTTPStatus.OK, {"tick": to_dict(tick)})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_rates(self, query):
        params = parse_qs(query)
        symbol = params.get("symbol", [None])[0]
        timeframe = params.get("timeframe", ["M1"])[0]
        count = int(params.get("count", ["100"])[0])
        if not symbol:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "symbol required"})
        if timeframe not in TIMEFRAME_MAP:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid timeframe"})
        try:
            with LOCK:
                ensure_mt5_initialized()
                tf = getattr(mt5, TIMEFRAME_MAP[timeframe])
                rates = mt5.copy_rates_from_pos(symbol, tf, 0, count)
            data = [dict(rate) for rate in (rates or [])]
            return json_response(self, HTTPStatus.OK, {"rates": data})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_symbols(self, query):
        params = parse_qs(query)
        pattern = params.get("pattern", [None])[0]
        try:
            with LOCK:
                ensure_mt5_initialized()
                symbols = mt5.symbols_get(pattern) if pattern else mt5.symbols_get()
            data = [to_dict(s) for s in (symbols or [])]
            return json_response(self, HTTPStatus.OK, {"symbols": data})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_order(self):
        body = parse_body(self) or {}
        order_type = str(body.get("type", "")).lower()
        if order_type not in ORDER_TYPE_MAP:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "invalid order type"})
        symbol = body.get("symbol")
        volume = body.get("volume")
        if not symbol or volume is None:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "symbol and volume required"})
        try:
            with LOCK:
                ensure_mt5_initialized()
                tick = mt5.symbol_info_tick(symbol)
                if tick is None:
                    return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "symbol not found"})
                order_type_const = getattr(mt5, ORDER_TYPE_MAP[order_type])
                is_pending = order_type in {
                    "buy_limit",
                    "sell_limit",
                    "buy_stop",
                    "sell_stop",
                    "buy_stop_limit",
                    "sell_stop_limit",
                }
                action = getattr(
                    mt5, ORDER_ACTION_MAP["pending" if is_pending else "market"]
                )
                price = body.get("price")
                if price is None:
                    if is_pending:
                        return json_response(
                            self, HTTPStatus.BAD_REQUEST, {"error": "price required for pending order"}
                        )
                    price = tick.ask if order_type in {"buy"} else tick.bid
                request = {
                    "action": action,
                    "symbol": symbol,
                    "volume": float(volume),
                    "type": order_type_const,
                    "price": float(price),
                    "sl": float(body.get("sl", 0)) if body.get("sl") else 0.0,
                    "tp": float(body.get("tp", 0)) if body.get("tp") else 0.0,
                    "deviation": int(body.get("deviation", 10)),
                    "magic": int(body.get("magic", 0)),
                    "comment": body.get("comment", "openclaw-mt5"),
                }
                if body.get("type_time"):
                    time_key = str(body.get("type_time")).lower()
                    if time_key not in ORDER_TIME_MAP:
                        return json_response(
                            self, HTTPStatus.BAD_REQUEST, {"error": "invalid type_time"}
                        )
                    request["type_time"] = getattr(mt5, ORDER_TIME_MAP[time_key])
                if body.get("type_filling"):
                    filling_key = str(body.get("type_filling")).lower()
                    if filling_key not in ORDER_FILLING_MAP:
                        return json_response(
                            self, HTTPStatus.BAD_REQUEST, {"error": "invalid type_filling"}
                        )
                    request["type_filling"] = getattr(mt5, ORDER_FILLING_MAP[filling_key])
                if body.get("expiration"):
                    request["expiration"] = int(body.get("expiration"))
                result = mt5.order_send(request)
            return json_response(self, HTTPStatus.OK, {"result": to_dict(result)})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_position_close(self):
        body = parse_body(self) or {}
        ticket = body.get("ticket")
        symbol = body.get("symbol")
        volume = body.get("volume")
        if not ticket and not symbol:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "ticket or symbol required"})
        try:
            with LOCK:
                ensure_mt5_initialized()
                if ticket:
                    positions = mt5.positions_get(ticket=int(ticket))
                else:
                    positions = mt5.positions_get(symbol=symbol)
                if not positions:
                    return json_response(self, HTTPStatus.NOT_FOUND, {"error": "position not found"})
                pos = positions[0]
                order_type = (
                    mt5.ORDER_TYPE_SELL if pos.type == mt5.POSITION_TYPE_BUY else mt5.ORDER_TYPE_BUY
                )
                request = {
                    "action": mt5.TRADE_ACTION_DEAL,
                    "position": pos.ticket,
                    "symbol": pos.symbol,
                    "volume": float(volume) if volume else pos.volume,
                    "type": order_type,
                    "price": mt5.symbol_info_tick(pos.symbol).bid
                    if order_type == mt5.ORDER_TYPE_SELL
                    else mt5.symbol_info_tick(pos.symbol).ask,
                    "deviation": int(body.get("deviation", 10)),
                    "magic": int(body.get("magic", 0)),
                    "comment": body.get("comment", "openclaw-mt5-close"),
                }
                result = mt5.order_send(request)
            return json_response(self, HTTPStatus.OK, {"result": to_dict(result)})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})

    def handle_position_modify(self):
        body = parse_body(self) or {}
        ticket = body.get("ticket")
        if not ticket:
            return json_response(self, HTTPStatus.BAD_REQUEST, {"error": "ticket required"})
        try:
            with LOCK:
                ensure_mt5_initialized()
                request = {
                    "action": mt5.TRADE_ACTION_SLTP,
                    "position": int(ticket),
                    "sl": float(body.get("sl", 0)) if body.get("sl") else 0.0,
                    "tp": float(body.get("tp", 0)) if body.get("tp") else 0.0,
                }
                result = mt5.order_send(request)
            return json_response(self, HTTPStatus.OK, {"result": to_dict(result)})
        except Exception as exc:
            return json_response(self, HTTPStatus.SERVICE_UNAVAILABLE, {"error": str(exc)})


def run_server():
    server = ThreadingHTTPServer((DEFAULT_HOST, DEFAULT_PORT), Mt5BridgeHandler)
    logger.info("MT5 bridge listening on %s:%s", DEFAULT_HOST, DEFAULT_PORT)
    try:
        server.serve_forever(poll_interval=0.5)
    except KeyboardInterrupt:
        pass
    finally:
        logger.info("MT5 bridge shutting down")
        mt5_shutdown()
        server.server_close()


if __name__ == "__main__":
    run_server()
