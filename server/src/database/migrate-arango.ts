process.env['DB_PROVIDER'] ??= 'arango';

const [{ ensureArangoSchema, getArangoDatabase, getArangoHealth }] = await Promise.all([
  import('./arango.js')
]);

await ensureArangoSchema();

const health = await getArangoHealth();
if (!health.ok) {
  throw new Error(health.error ?? 'ArangoDB health check failed.');
}

console.log(
  JSON.stringify(
    {
      status: 'ok',
      storage: 'arango',
      database: getArangoDatabase().name,
      migrations: 'applied'
    },
    null,
    2
  )
);
