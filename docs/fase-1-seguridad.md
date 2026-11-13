# Fase 1 — Cifrado local, migración e integridad bancaria

Estado: trabajo en rama de desarrollo. **Aún no validado con extractos reales ni prueba funcional en navegador.**

## Cambios realizados

- IndexedDB guarda un único documento cifrado con AES-256-GCM mediante Web Crypto.
- Clave derivada de contraseña con PBKDF2-SHA-256, 600.000 iteraciones, sal de 128 bits. La clave es no exportable.
- Cada escritura usa IV aleatorio de 96 bits. La contraseña no se almacena en disco ni se envía al servidor.
- Bloqueo manual y obligatorio tras recargar la página.
- Migración desde la base anterior: se guarda y verifica primero el registro cifrado y, solo después, se limpian los almacenes antiguos. Si la limpieza falla, se muestra aviso.
- Se puede importar una copia JSON antigua después de desbloquear. Las copias nuevas se exportan únicamente cifradas.
- CSV: rechazo de importes vacíos, soporte básico para Windows-1252 y detección de duplicados durante la importación.
- PDF: se deseleccionan movimientos con varios importes sin signo unívoco para revisión manual.
- La palabra VISA ya no hace que una compra se considere pago de tarjeta.
- Se bloquea el borrado de cuentas que todavía contienen movimientos.

## Pruebas manuales imprescindibles

1. Antes de cambiar de versión, guardar la copia JSON antigua fuera de carpetas compartidas: esa copia no está cifrada.
2. Probar la migración en un entorno de ensayo. Los datos de IndexedDB solo se ven desde el mismo dominio, subdominio y protocolo: un despliegue en otro origen no los verá.
3. Crear contraseña larga y confirmar que los saldos, movimientos, categorías y ajustes quedan intactos.
4. Bloquear y refrescar la página: no se debe visualizar ningún saldo sin contraseña. La contraseña errónea debe fallar.
5. Crear y editar movimientos; cerrar la sesión y comprobar que persisten al desbloquear.
6. Exportar copia cifrada y comprobar que el archivo no contiene conceptos, importes ni bancos en texto legible. Probar restauración correcta e incorrecta.
7. Importar CSV ficticio con positivos, negativos, duplicados e importes vacíos; revisar los resultados.
8. Importar PDF ficticio con columna de importe y saldo; revisar los movimientos ambiguos antes de aceptarlos.
9. Comprobar transferencias internas y liquidaciones de tarjeta y consultar la pestaña de auditoría.
10. Inspeccionar IndexedDB: los registros nuevos deben estar cifrados en finanzas-vault-v1; después de migrar, finanzas-local-db debe haber quedado sin registros personales.

Comandos de pruebas locales, con Bun instalado:
- bun install
- bun test
- bun run typecheck

No se ha ejecutado ninguna prueba de navegador ni una compilación completa desde este entorno. No se han utilizado minutos de GitHub Actions.

## Limitaciones de seguridad

- No existe recuperación de contraseña: guardar una copia cifrada y conservar la contraseña.
- El cifrado protege datos en reposo, pero no contra malware, extensiones o código JavaScript ejecutado mientras la aplicación está desbloqueada.
- No editar en varias pestañas: las escrituras se serializan dentro de una pestaña, no entre pestañas o dispositivos.
- IndexedDB no garantiza borrado forense seguro; podrían existir otros respaldos antiguos sin cifrar.
- La protección frente a scripts de terceros, la política CSP y una auditoría de dependencias siguen pendientes.
- El OCR puede confundir saldo con importe; no confirmar automáticamente importes dudosos.
- Queda pendiente validar conciliación contable con extractos reales de distintos bancos.
- El CSV con saltos de línea dentro de celdas entrecomilladas no se admite correctamente.
- No hay todavía una auditoría externa de seguridad, ni pruebas de integración de IndexedDB o restauración entre navegadores.

## Despliegue y privacidad

Web Crypto requiere HTTPS o localhost. Nunca subir extractos ni copias a GitHub, incidencias o repositorios. Cambiar de dominio implica un nuevo almacenamiento local: para trasladar información, usar una copia cifrada. El código no implementa peticiones de subida de datos financieros, pero antes de uso real deben auditarse dependencias y recursos externos.

## Próximas tareas

1. Prueba funcional con datos ficticios en Safari y Chrome.
2. Mapeo editable de columnas CSV, perfiles de bancos y conciliación de saldo.
3. Seguridad entre pestañas y cabeceras CSP.
4. Módulo avanzado de hipotecas, préstamos y asesoramiento.
