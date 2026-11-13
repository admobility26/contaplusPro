# ContaPlus Pro

**Asesor financiero doméstico privado**, independiente del proyecto original. Esta versión contiene la interfaz de cuentas y movimientos, importación CSV/PDF y la primera fase del almacenamiento local cifrado.

> **Fase de pruebas.** No introducir extractos ni saldos reales hasta superar las pruebas de seguridad, migración e integridad bancaria descritas en [docs/fase-1-seguridad.md](docs/fase-1-seguridad.md).

## Lo que ya incluye

- Cuentas corrientes, tarjetas, préstamos, hipotecas y saldos manuales.
- Registro y edición de movimientos y categorías; dashboard y asesor por reglas.
- Importación CSV/PDF con revisión previa, OCR en español en el propio dispositivo y auditoría básica de duplicados.
- Caja cifrada local (AES-256-GCM / PBKDF2), pantalla de contraseña y copias de seguridad cifradas.

## Desarrollo (ordenador)

Requisitos: Node.js reciente y [Bun](https://bun.sh/) para el test de regresión.

```sh
bun install
bun run dev
```

`bun run dev` genera previamente los archivos locales necesarios para OCR a partir de las dependencias instaladas. No se descargan ni almacenan extractos bancarios en GitHub.

### Comprobaciones

```sh
bun test
bun run typecheck
bun run build
```

## Seguridad y datos

- Los saldos y extractos se guardan en IndexedDB **cifrados en el navegador que utilizas**. Cambiar de dominio u ordenador no transporta los datos automáticamente.
- La contraseña no se guarda. Si la pierdes y no tienes forma de recuperar una sesión desbloqueada, los datos cifrados pueden resultar irrecuperables.
- Descarga copias cifradas y guárdalas fuera de GitHub. **Nunca subas documentos bancarios o respaldos sin cifrar al repositorio**, ni aunque posteriormente lo marques como privado.
- El cifrado de datos en reposo no protege frente a extensiones maliciosas, código remoto o un equipo comprometido.

## Repositorio independiente

No está conectado al proyecto de Lovable utilizado en el prototipo inicial. La compilación aún utiliza el paquete de configuración de TanStack de Lovable; esto es una dependencia técnica, **no un enlace de sincronización con la aplicación anterior**.

## Tareas pendientes

Ver [fase 1: pruebas y límites](docs/fase-1-seguridad.md). Hasta que finalice la validación de navegador, este proyecto no debe considerarse listo para uso bancario real.
