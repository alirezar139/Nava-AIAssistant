process.env['DB_PROVIDER'] ??= 'arango';

const [
  { aql },
  { arangoCollections, ensureArangoSchema, getArangoDatabase, getArangoHealth },
  treeRepository
] = await Promise.all([
  import('arangojs/aql'),
  import('./arango.js'),
  import('../troubleshooting-tree/troubleshooting-tree.repository.js')
]);

await ensureArangoSchema();
await treeRepository.getTroubleshootingTree('default');

const health = await getArangoHealth();
if (!health.ok) {
  throw new Error(health.error ?? 'ArangoDB health check failed.');
}

const database = getArangoDatabase();
const collections = await Promise.all(
  Object.entries(arangoCollections).map(async ([key, name]) => {
    const collection = database.collection(name);
    const cursor = await database.query<number>(aql`
      RETURN LENGTH(${collection})
    `);
    return [key, (await cursor.next()) ?? 0] as const;
  })
);

console.log(
  JSON.stringify(
    {
      status: 'ok',
      storage: 'arango',
      arango: health,
      database: database.name,
      collections: Object.fromEntries(collections)
    },
    null,
    2
  )
);
