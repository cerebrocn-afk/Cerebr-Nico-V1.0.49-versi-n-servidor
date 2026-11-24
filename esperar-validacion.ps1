# esperar-validacion.ps1 — vigila el log de `npm run validar` y deja el veredicto en validar-2.3.13.resultado.txt
# No mata nada, no compila nada: solo espera y copia el final del log cuando deja de crecer.

$ErrorActionPreference = 'Stop'
$app  = 'C:\Users\BirdBox\Downloads\cerebronico 3-11-2026\CerebroNico-IDE-v2.3.8\app'
$log  = Join-Path $app 'validar-2.3.13.log'
$out  = Join-Path $app 'validar-2.3.13.resultado.txt'

$limiteMin = 45
$inicio    = Get-Date
$ultimo    = -1
$estable   = 0

Write-Host "Vigilando $log (maximo $limiteMin min)..."

while (((Get-Date) - $inicio).TotalMinutes -lt $limiteMin) {
    if (Test-Path $log) {
        $len = (Get-Item $log).Length
        if ($len -eq $ultimo) {
            $estable++
            # 6 lecturas seguidas sin cambios (30 s) = el proceso termino o se cayo
            if ($estable -ge 6) { break }
        } else {
            $estable = 0
            $ultimo  = $len
        }
    }
    Start-Sleep -Seconds 5
}

$texto = if (Test-Path $log) { Get-Content $log -Raw } else { '(no existe el log)' }
$lineas = $texto -split "`r?`n"

# Buscar el veredicto: lineas con VERDE / ROJO / FALLO / OK / ERROR
$veredicto = $lineas | Where-Object { $_ -match 'VERDE|ROJO|FALL|ERROR|OK:|comprobaciones' } | Select-Object -Last 25

$cabecera = @(
    "=== RESULTADO DE LA VALIDACION 2.3.13 ===",
    "Generado: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
    "Duracion vigilada: $([int]((Get-Date) - $inicio).TotalMinutes) min",
    "Bytes del log: $((Get-Item $log).Length)",
    ""
)

$cabecera + $veredicto + @("", "--- ULTIMAS 40 LINEAS DEL LOG ---") + ($lineas | Select-Object -Last 40) |
    Set-Content -Path $out -Encoding UTF8

Write-Host ""
Write-Host "Resultado escrito en: $out"
Get-Content $out
