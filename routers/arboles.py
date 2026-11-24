# -*- coding: utf-8 -*-
"""
Router del SISTEMA DE DOBLE ÁRBOL (v1.60.0).

Expone el lado servidor del aislamiento de contexto:

  * Lectura QUIRÚRGICA: devuelve solo un rango de líneas de un archivo, para que
    el motor no cargue archivos enteros (ni su ruido) en el contexto.
  * Ejecución en el SANDBOX: corre un comando de obra con `asyncio` y un
    timeout duro, sin bloquear el event loop ni colgar el servidor.

Todo queda confinado a una RAÍZ de sandbox: no se lee ni se ejecuta nada fuera
de ella (aduana anti-traversal), que es justo el punto del doble árbol.
"""

import asyncio
import os

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(tags=["Doble Árbol"])

# Raíz del sandbox: todo lo que el motor toca vive bajo aquí. Configurable por
# entorno; por defecto, el directorio de trabajo del proceso.
SANDBOX_RAIZ = os.path.abspath(os.getenv("CEREBRONICO_SANDBOX", os.getcwd()))


def _resolver_en_sandbox(path_relativo: str) -> str:
    """
    Resuelve una ruta relativa DENTRO del sandbox y rechaza cualquier intento de
    escapar con `..` o rutas absolutas (aduana anti-traversal).
    """
    candidato = os.path.abspath(os.path.join(SANDBOX_RAIZ, path_relativo))
    raiz_con_sep = SANDBOX_RAIZ.rstrip(os.sep) + os.sep
    if candidato != SANDBOX_RAIZ and not candidato.startswith(raiz_con_sep):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Ruta fuera del sandbox: '{path_relativo}'.",
        )
    return candidato


class LecturaQuirurgicaRequest(BaseModel):
    path: str = Field(..., description="Ruta relativa dentro del sandbox")
    desde_linea: int = Field(1, ge=1, description="Primera línea (1-indexada)")
    hasta_linea: int = Field(
        0, ge=0, description="Última línea inclusive; 0 = hasta el final"
    )


class LecturaQuirurgicaResponse(BaseModel):
    path: str
    desde_linea: int
    hasta_linea: int
    total_lineas: int
    contenido: str


@router.post(
    "/arboles/leer_quirurgico",
    response_model=LecturaQuirurgicaResponse,
    summary="Leer un rango de líneas (lectura quirúrgica)",
)
async def leer_quirurgico(payload: LecturaQuirurgicaRequest) -> LecturaQuirurgicaResponse:
    """
    Devuelve solo el rango pedido de un archivo del sandbox. Evita cargar
    archivos enteros en el contexto del modelo.
    """
    ruta = _resolver_en_sandbox(payload.path)
    if not os.path.isfile(ruta):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"El archivo '{payload.path}' no existe en el sandbox.",
        )
    try:
        with open(ruta, "r", encoding="utf-8", errors="replace") as f:
            lineas = f.read().splitlines()
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(e),
        )

    total = len(lineas)
    desde = max(1, payload.desde_linea)
    hasta = total if payload.hasta_linea in (0, None) else min(payload.hasta_linea, total)
    if hasta < desde:
        hasta = desde
    recorte = lineas[desde - 1 : hasta]
    return LecturaQuirurgicaResponse(
        path=payload.path,
        desde_linea=desde,
        hasta_linea=hasta,
        total_lineas=total,
        contenido="\n".join(recorte),
    )


class EjecutarSandboxRequest(BaseModel):
    comando: str = Field(..., description="Comando a ejecutar dentro del sandbox")
    timeout: float = Field(
        120.0, gt=0, le=900, description="Segundos máximos antes de abortar"
    )


class EjecutarSandboxResponse(BaseModel):
    comando: str
    codigo_salida: int
    stdout: str
    stderr: str
    expiro: bool


@router.post(
    "/arboles/ejecutar_sandbox",
    response_model=EjecutarSandboxResponse,
    summary="Ejecutar un comando en el sandbox (asyncio + timeout)",
)
async def ejecutar_sandbox(payload: EjecutarSandboxRequest) -> EjecutarSandboxResponse:
    """
    Corre un comando en la raíz del sandbox con `asyncio` (no bloquea el event
    loop) y un timeout duro: si expira, se mata el proceso y se informa en vez
    de colgar el servidor.
    """
    comando = payload.comando.strip()
    if not comando:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Comando vacío.",
        )
    try:
        proceso = await asyncio.create_subprocess_shell(
            comando,
            cwd=SANDBOX_RAIZ,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"No se pudo lanzar el comando: {e}",
        )

    try:
        out_b, err_b = await asyncio.wait_for(proceso.communicate(), timeout=payload.timeout)
    except asyncio.TimeoutError:
        proceso.kill()
        await proceso.wait()
        return EjecutarSandboxResponse(
            comando=comando,
            codigo_salida=-1,
            stdout="",
            stderr=f"El comando superó el límite de {payload.timeout} s y fue abortado.",
            expiro=True,
        )

    return EjecutarSandboxResponse(
        comando=comando,
        codigo_salida=proceso.returncode if proceso.returncode is not None else -1,
        stdout=out_b.decode("utf-8", errors="replace"),
        stderr=err_b.decode("utf-8", errors="replace"),
        expiro=False,
    )
