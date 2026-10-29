// Generate a guarded schema bootstrap for an EMPTY synthetic-only staging DB.
// Do not use on production. All statements execute inside one transaction.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const omitted = new Set([
  // The consolidated schema already contains a newer shape of these views;
  // replaying either old migration attempts to drop view columns.
  '20261017_product_detail_price_visibility.sql',
  '20261017_product_only_reference_prices.sql',
]);
const files = ['supabase/schema.sql', ...readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql') && !omitted.has(f)).sort().map((f) => `supabase/migrations/${f}`)];
const parts = files.map((file) => {
  let source = readFileSync(file, 'utf8');
  if (source.includes('$vexim_staging_sql$')) throw new Error(`Reserved delimiter in ${file}`);
  if (file === 'supabase/schema.sql') {
    // Hosted Supabase owns storage.objects; the SQL API cannot alter it. Do not
    // change Storage policies in staging. The outer guard requires existing RLS
    // and zero policies, so service-role access remains the only object access.
    const storagePolicy = `alter table storage.objects enable row level security;\n\ndrop policy if exists "email attachments service only" on storage.objects;\ncreate policy "email attachments service only" on storage.objects\n  for all to service_role\n  using (bucket_id = 'email-attachments')\n  with check (bucket_id = 'email-attachments');`;
    if (!source.includes(storagePolicy)) throw new Error('Storage policy block changed; inspect before preparing staging');
    source = source.replace(storagePolicy, '-- Hosted storage.objects is left unchanged; staging guard verifies RLS and zero policies.');
  }
  // These are top-level transaction markers in the source files. The whole
  // bootstrap is already atomic and nested transaction commands cannot run via EXECUTE.
  const content = source.replace(/^begin;\s*$/gm, '').replace(/^commit;\s*$/gm, '');
  return `\n-- BEGIN ${file}\n${content}\n-- END ${file}\n`;
});
const script = `-- STAGING ONLY: new empty synthetic project, NEVER production.\n-- Built from consolidated schema and migrations, no production data.\n-- Guard plus all schema changes share one transaction.\ndo $vexim_staging_guard$\nbegin\n  if exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace\n    where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')) then\n    raise exception 'Staging bootstrap requires an empty public schema';\n  end if;\n  if not exists (select 1 from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid = c.relnamespace\n    where n.nspname = 'storage' and c.relname = 'objects' and c.relrowsecurity)\n    or exists (select 1 from pg_catalog.pg_policies where schemaname = 'storage' and tablename = 'objects') then\n    raise exception 'Staging storage must have RLS enabled and no object policies';\n  end if;\n  execute $vexim_staging_sql$${parts.join('\n')}$vexim_staging_sql$;\nend;\n$vexim_staging_guard$;\n`;
writeFileSync('supabase/staging/bootstrap.sql', script);
console.log(`Wrote guarded staging bootstrap, ${files.length} sources, ${Buffer.byteLength(script)} bytes`);
