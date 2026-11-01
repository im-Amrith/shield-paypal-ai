import { cookies } from "next/headers";
import type { Persona } from "./types";
import { db } from "./store";

export const PERSONAS: Persona[] = ["meera", "ravi", "buyer", "client", "agent"];

export async function getPersona(): Promise<Persona> {
  const v = (await cookies()).get("persona")?.value as Persona | undefined;
  return v && PERSONAS.includes(v) ? v : "meera";
}

export async function getUser() {
  const id = await getPersona();
  return db().users.find((u) => u.id === id)!;
}
