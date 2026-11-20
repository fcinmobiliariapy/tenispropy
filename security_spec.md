# Especificación de Seguridad Firestore — TenisCupy

## 1. Invariantes de Datos
1. **Aislamiento de PII (`players_private`)**: Los campos sensibles (`documentNumber`, `birthDate`, `phone`, `email`) nunca se almacenan en `players_public` ni se exponen a usuarios no autenticados o sin rol de staff verificado.
2. **Integridad de Roles (`staff_roles`)**: Un usuario jamás puede autoasignarse `role: 'superadmin'`, `organizador` ni `operador` al crear o editar su perfil. Solo el superadministrador verificado puede administrar roles.
3. **Separación de Galerías en Borrador (`photos_drafts` vs `photos`)**: Las fotos en estado borrador residen en `photos_drafts` (acceso exclusivo de organizadores/superadmin), mientras que `photos` solo contiene imágenes con `published == true`.
4. **Validación Estricta de Esquema e IDs**: Todo `id` de documento debe cumplir `^[a-zA-Z0-9_\-]+$` con longitud máxima de 128 caracteres. Todas las cadenas tienen cotas de tamaño y las listas tienen límites máximos.
5. **Integridad Temporal**: Todo documento creado valida marcas temporales de servidor (`request.time`) o formato controlado y bloquea campos inmutables (`createdAt`, `tournamentId`, `playerId`).
6. **Operadores con Alcance Limitado**: Un `operador` solo puede actualizar marcadores/estado de partidos (`matches`) en los torneos donde esté asignado, sin poder eliminar torneos ni leer/editar `staff_roles` de otros usuarios.

## 2. Payloads Adversarios ("Dirty Dozen")
1. **Auto-escalamiento de privilegios**: Usuario regular intenta `create` en `/staff_roles/{uid}` con `role: "superadmin"`. -> `PERMISSION_DENIED`.
2. **Lectura pública de PII**: Usuario anónimo intenta `get` o `list` en `/players_private`. -> `PERMISSION_DENIED`.
3. **Spoofing de email no verificado**: Usuario con `email == "elpatriota62@gmail.com"` pero `email_verified == false` intenta escribir un torneo. -> `PERMISSION_DENIED`.
4. **Inyección de campos fantasma (Shadow Update)**: Usuario intenta actualizar `/tournaments/{id}` enviando un campo no permitido `isVerified: true`. -> `PERMISSION_DENIED`.
5. **Poisoning de ID de documento**: Intento de crear documento con ID de 300 caracteres o caracteres especiales `../admin`. -> `PERMISSION_DENIED`.
6. **Falsificación de fecha de creación**: Intento de modificar `createdAt` en un `update` de `/matches/{id}`. -> `PERMISSION_DENIED`.
7. **Operador creando torneo**: Usuario con rol `operador` intenta crear un torneo en `/tournaments`. -> `PERMISSION_DENIED`.
8. **Operador borrando partido**: Usuario con rol `operador` intenta `delete` en `/matches/{id}`. -> `PERMISSION_DENIED`.
9. **Lectura pública de fotos en borrador**: Usuario no autenticado intenta `list` o `get` en `/photos_drafts`. -> `PERMISSION_DENIED`.
10. **Desbordamiento de memoria en strings**: Envío de `bio` de 10.000 caracteres en `/players_public/{id}`. -> `PERMISSION_DENIED`.
11. **Mutación de `tournamentId` en división**: Intento de reasignar `tournamentId` al actualizar `/divisions/{id}`. -> `PERMISSION_DENIED`.
12. **Escritura en colección desconocida**: Intento de crear documento en `/arbitrary_collection/123`. -> `PERMISSION_DENIED`.
