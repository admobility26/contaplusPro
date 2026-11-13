import { describe, expect, test } from "bun:test";
import { defaultCategories } from "../src/lib/defaults";
import { classify } from "../src/lib/finance";
import { parseBankAmount, parseBankDate, parseBankTextDetailed } from "../src/lib/bank-parser";

describe("Importación y clasificación bancaria", () => {
  test("acepta importes españoles y signo final", () => {
    expect(parseBankAmount("1.234,56")).toBe(1234.56);
    expect(parseBankAmount("83,27-")).toBe(-83.27);
    expect(parseBankAmount("-0,70")).toBe(-0.7);
  });

  test("rechaza importes vacíos y fechas imposibles", () => {
    expect(Number.isNaN(parseBankAmount(""))).toBe(true);
    expect(Number.isNaN(parseBankAmount("  "))).toBe(true);
    expect(parseBankDate("31/02/2026")).toBe("");
    expect(parseBankDate("30/11/2026")).toBe("2026-11-30");
  });

  test("una compra VISA es gasto, no liquidación de tarjeta", () => {
    expect(classify("COMPRA VISA MERCADONA", -35.2, defaultCategories).id).toBe("exp-food");
    expect(classify("PAGO TARJETA VISA", -140, defaultCategories).id).toBe("exp-card");
    expect(classify("TRASPASO ENTRE MIS CUENTAS", -100, defaultCategories).id).toBe("transfer");
  });

  test("deselecciona filas ambiguas con saldo y movimiento sin signo", () => {
    const result = parseBankTextDetailed(
      "Kutxabank\n01/09/2026 COMPRA ALIMENTACION 35,20 2.400,80",
      "cuenta-demo",
      defaultCategories,
      [],
    );
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]?.selected).toBe(false);
    expect(result.candidates[0]?.confidence).toBeLessThan(0.5);
  });

  test("evita doble selección de duplicados dentro del mismo extracto", () => {
    const result = parseBankTextDetailed(
      "Laboral Kutxa\n02/09/2026 COMPRA EROSKI -21,50\n02/09/2026 COMPRA EROSKI -21,50",
      "cuenta-demo",
      defaultCategories,
      [],
    );
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]?.selected).toBe(true);
    expect(result.candidates[1]?.duplicate).toBe(true);
    expect(result.candidates[1]?.selected).toBe(false);
  });
});
