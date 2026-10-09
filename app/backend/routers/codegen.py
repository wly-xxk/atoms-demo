import logging
import os
from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from dependencies.auth import get_current_user
from schemas.auth import UserResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/codegen", tags=["codegen"])


class ChatMsg(BaseModel):
    role: str
    content: str


class GenerateRequest(BaseModel):
    messages: List[ChatMsg]


class GenerateResponse(BaseModel):
    content: str


@router.post("/generate", response_model=GenerateResponse)
async def generate(data: GenerateRequest, current_user: UserResponse = Depends(get_current_user)):
    api_key = os.environ.get("LLM_API_KEY")
    base_url = (os.environ.get("LLM_BASE_URL") or "https://api.deepseek.com/v1").rstrip("/")
    model = os.environ.get("LLM_MODEL") or "deepseek-chat"
    if not api_key:
        raise HTTPException(status_code=503, detail="模型 API Key 未配置，请在平台密钥设置中添加 LLM_API_KEY")
    if not data.messages:
        raise HTTPException(status_code=400, detail="消息不能为空")

    payload = {
        "model": model,
        "messages": [m.model_dump() for m in data.messages],
        "temperature": 0.4,
        "stream": False,
    }
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300.0, connect=15.0)) as client:
            resp = await client.post(
                f"{base_url}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as e:
        logger.error(f"LLM request failed: {e}")
        raise HTTPException(status_code=502, detail="连接模型服务失败，请稍后重试")

    if resp.status_code != 200:
        logger.error(f"LLM error {resp.status_code}: {resp.text[:500]}")
        raise HTTPException(status_code=502, detail=f"模型服务返回错误（{resp.status_code}），请检查 Key、地址和模型名")

    try:
        content = resp.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError):
        raise HTTPException(status_code=502, detail="模型返回格式异常，请重试")
    if not content.strip():
        raise HTTPException(status_code=502, detail="模型未返回内容，请重试")
    return GenerateResponse(content=content)
