"""ASGI streaming cap: covers chunked requests and multipart spooling too."""
from fastapi import HTTPException

class RequestBodyTooLarge(HTTPException):
    def __init__(self): super().__init__(413,"Request exceeds body size limit")

class StreamingBodyLimit:
    def __init__(self,app,max_bytes):
        self.app=app;self.max_bytes=max_bytes
    async def __call__(self,scope,receive,send):
        if scope["type"]!="http": return await self.app(scope,receive,send)
        consumed=0
        async def limited_receive():
            nonlocal consumed
            message=await receive()
            if message["type"]=="http.request":
                consumed+=len(message.get("body",b""))
                if consumed>self.max_bytes: raise RequestBodyTooLarge()
            return message
        await self.app(scope,limited_receive,send)
