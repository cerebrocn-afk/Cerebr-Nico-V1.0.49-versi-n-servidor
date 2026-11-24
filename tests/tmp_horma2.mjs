import { decidirHorma } from "../src/engine/hormaChat.ts";

const base = { anchoPx: 1920, izquierdaAbierta: false, derechaAbierta: false, izquierdaPx: 260, derechaPx: 420 };
const soloDerecha = { ...base, derechaAbierta: true };
const todoAbierto = { ...base, izquierdaAbierta: true, derechaAbierta: true };
const d1 = decidirHorma(soloDerecha);
const d2 = decidirHorma(todoAbierto);
console.log("soloDerecha:", d1.paso, d1.px, "libre", d1.librePx, "| aserción pide amplia2");
console.log("todoAbierto:", d2.paso, d2.px, "libre", d2.librePx, "| aserción pide holgada2");
console.log("VEREDICTO:", d1.paso === "amplia2" && d2.paso === "holgada2" ? "LAS DOS ASERCIONES PASAN" : "SIGUEN FALLANDO");
