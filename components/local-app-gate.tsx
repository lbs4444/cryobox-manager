"use client";

import { InventoryApp } from "./inventory-app";
import { PwaRegister } from "./pwa-register";

export function LocalAppGate() {
  return (
    <>
      <PwaRegister />
      <InventoryApp mode="demo" />
    </>
  );
}
