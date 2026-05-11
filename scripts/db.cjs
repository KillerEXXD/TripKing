#!/usr/bin/env node
/**
 * Run SQL against the Trip King Supabase project via the Management API.
 *
 *   node scripts/db.cjs "select count(*) from public.cities"
 *   node scripts/db.cjs --file supabase/migrations/20260512100000_init.sql
 *
 * The Management API endpoint `POST /v1/projects/{ref}/database/query` runs SQL
 * *outside* a transaction (so it handles DDL, multi-statement files, VACUUM, …).
 *
 * The access token is read from the Supabase CLI's Windows Credential Manager
 * entry ("Supabase CLI:supabase", set by `npx supabase login`) — it is NOT
 * stored in this repo. If it isn't there, run `npx supabase login` first.
 */
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

const PROJECT_REF = 'saxcbebqxgatiktsebxw';

function getAccessToken() {
  // env override (e.g. CI) wins
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN.trim();
  const ps = `Add-Type -TypeDefinition @"
using System; using System.Runtime.InteropServices; using System.Text;
public class Cr { [DllImport("advapi32.dll", SetLastError=true, CharSet=CharSet.Unicode)] public static extern bool CredReadW(string t,int ty,int f,out IntPtr c); [DllImport("advapi32.dll")] public static extern void CredFree(IntPtr c); [StructLayout(LayoutKind.Sequential)] public struct CRED{ public int Flags;public int Type;public string TargetName;public string Comment;public long LastWritten;public int BlobSize;public IntPtr Blob;public int Persist;public int AttrCount;public IntPtr Attrs;public string TargetAlias;public string UserName;} public static string G(string t){ IntPtr p; if(CredReadW(t,1,0,out p)){ CRED c=(CRED)Marshal.PtrToStructure(p,typeof(CRED)); byte[] b=new byte[c.BlobSize]; Marshal.Copy(c.Blob,b,0,c.BlobSize); CredFree(p); return Encoding.UTF8.GetString(b);} return null;} }
"@; [Cr]::G("Supabase CLI:supabase")`;
  try {
    return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function runSql(query) {
  const token = getAccessToken();
  if (!token || !token.startsWith('sbp_')) {
    console.error('No Supabase access token. Run `npx supabase login`, or set SUPABASE_ACCESS_TOKEN.');
    process.exit(1);
  }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function main() {
  const args = process.argv.slice(2);
  let query;
  if (args[0] === '--file' || args[0] === '-f') query = fs.readFileSync(args[1], 'utf8');
  else query = args.join(' ');
  if (!query || !query.trim()) {
    console.error('usage: node scripts/db.cjs "<SQL>"   |   node scripts/db.cjs --file <path.sql>');
    process.exit(2);
  }
  const { status, text } = await runSql(query);
  console.log(`[${status}]`);
  try { console.log(JSON.stringify(JSON.parse(text), null, 2)); } catch { console.log(text); }
  if (status !== 200 && status !== 201) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
