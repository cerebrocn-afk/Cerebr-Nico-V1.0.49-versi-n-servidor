/** Autenticación y restauración antes de montar los efectos de autoguardado. */
export async function prepararServidor(keys:Record<string,string>):Promise<boolean> {
  try {
    let respuesta=await fetch('./api/server/config');
    if (respuesta.status===401) {
      const token=window.prompt('Edición servidor: clave de acceso (ACCESS_TOKEN). No es la API key de Ollama.');
      if (!token) return false;
      const login=await fetch('./api/server/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
      if (!login.ok) {window.alert('No se pudo iniciar sesión. Comprueba la clave, HTTPS y el origen público configurado.');return false;}
      respuesta=await fetch('./api/server/config');
    }
    if (!respuesta.ok || !respuesta.headers.get('content-type')?.includes('application/json')) return true; // escritorio original
    const d=await respuesta.json(); if (!d.serverMode) return true;
    (window as any).__CN_SERVER_MODE__=true;
    (window as any).__CN_SERVER_PREVIEW__=new URL(d.preview,window.location.origin).href;
    localStorage.setItem(keys.OLLAMA_URL,d.ollamaUrl);
    // No restaurar archivos desde una copia vieja del navegador: el disco manda.
    localStorage.setItem(keys.WORKSPACE_FILES,'[]');
    localStorage.setItem(keys.WORKSPACE_SEEDED,'1');
    if (d.session) {
      localStorage.setItem(keys.MESSAGES,JSON.stringify(d.session.messages||[]));
      if (d.session.currentModel) localStorage.setItem(keys.CURRENT_MODEL,d.session.currentModel);
      if (d.session.provider) localStorage.setItem(keys.PROVIDER,d.session.provider);
      localStorage.setItem('codigo0_arranque','restaurar');
    } else {localStorage.setItem(keys.MESSAGES,'[]');}
    return true;
  } catch {window.alert('No se pudo verificar el servidor. Recarga la página cuando vuelva a responder.');return false;}
}
