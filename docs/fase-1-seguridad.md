# ContaPlus Pro · Primera fase: seguridad e importaciones

## Estado
Código trasladado al repositorio independiente `admobility26/contaplusPro`. **Todavía no validado en navegador ni compilado. No importar extractos bancarios reales.**

## Separación del proyecto anterior
- La nueva aplicación **no abre, modifica ni borra la base IndexedDB de la aplicación anterior**. Se crea una caja local nueva y cifrada.
- Si deseas llevar movimientos antiguos al proyecto nuevo, exporta desde la aplicación vieja un respaldo JSON. Después de crear la contraseña del nuevo proyecto, entra en **Ajustes → Importar copia antigua sin cifrar**.
- La importación antigua sustituye los datos de la caja nueva, nunca los de la aplicación original.
- Como el almacenamiento IndexedDB está asociado al origen web (protocolo, dominio y puerto), si abres la app desde otro dominio no verás automáticamente tus datos anteriores.

## Funciones incluidas
- AES-256-GCM en el navegador mediante Web Crypto; clave PBKDF2-SHA-256 con 600.000 iteraciones y sal aleatoria; contraseña y clave no se guardan en disco.
- Pantalla de crear contraseña, desbloqueo después de recargar y botón de bloqueo manual.
- Copias de seguridad cifradas JSON, con contraseña requerida para restaurarlas; importación de archivos JSON sin cifrar de la versión anterior de manera voluntaria.
- Importación CSV/PDF con validación de fechas, importes, detección de duplicados durante la lectura y deselección de importes ambiguos.
- Diferenciación básica de compras con VISA y liquidaciones de tarjeta; auditoría de cuentas, transferencias y duplicados.
- Los archivos de OCR se generan en la instalación desde dependencias; se sirven desde el mismo origen. Los modelos y binarios grandes no se guardan en GitHub.

## Pruebas de aceptación (usar siempre datos ficticios)
1. Arrancar el proyecto y comprobar que aparece la creación de contraseña de al menos 12 caracteres.
2. Crear una caja con movimientos sintéticos; editar un importe; bloquear y recargar. No deben aparecer datos antes de introducir contraseña.
3. Verificar que una contraseña errónea no permite desbloquear.
4. Descargar un respaldo cifrado; abrir el JSON y confirmar que no aparecen cuentas, importes ni conceptos en claro.
5. Restaurar respaldo con contraseña correcta y comprobar cifras. Con contraseña errónea, el respaldo existente no debe reemplazarse.
6. Importar una copia antigua ficticia sin cifrar mediante el botón manual de Ajustes, comprobar recuentos y generar un nuevo respaldo cifrado.
7. Importar CSV con decimales europeos, positivos, negativos, fechas inválidas, importe vacío y duplicados.
8. Importar PDF con columnas de importe y saldo; revisar cada fila ambigua antes de guardar. Confirmar saldo final con un extracto ficticio.
9. Comprobar transferencias internas, tarjetas y pagos recurrentes sin contar dos veces.
10. Confirmar que todos los datos privados están en `finanzas-vault-v1`, no en el repositorio ni en la base de datos antigua.

Para pruebas locales con Bun: `bun install`, `bun test`, `bun run typecheck`, `bun run build`. Los scripts previos `predev` y `prebuild` copian los activos de Tesseract al directorio público automáticamente.

## Riesgos pendientes
- Sin recuperación de contraseña ni acceso multidispositivo.
- Protección de datos en reposo, **no** frente a malware/extensiones o JavaScript comprometido durante la sesión.
- No editar simultáneamente en varias pestañas: la cola de escritura protege solo una pestaña.
- Falta política CSP estricta, auditoría de dependencias y pruebas reales en Safari/Chrome.
- OCR y parsing de extractos deben compararse con saldos bancarios de prueba; aún no existen perfiles completos por entidad ni mapeo editable de CSV.
- No se han ejecutado pruebas en este entorno: se ha confirmado la copia del código, no su funcionamiento.
- El repositorio es **público**: no agregar jamás documentos bancarios, copias de datos, contraseñas, ni ficheros `.env`.

## Etapas siguientes
1. Compilación y pruebas de navegador con datos ficticios.
2. Mejoras de conciliación bancaria y perfiles CSV/PDF.
3. Endurecimiento de seguridad y pruebas entre pestañas.
4. Amortización y gestión avanzada de préstamos e hipotecas.
