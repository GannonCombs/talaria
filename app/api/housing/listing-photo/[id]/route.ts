import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { dbGet } from '@/lib/db';
import { fetchListingPhoto } from '@/lib/modules/housing/listing-photo';

// Disk cache root. Files live under public/listing-photos/<id>.<ext>
// where ext is jpg by default. We also write a 0-byte sentinel at
// <id>.none to mark "we tried and there was no imagery" so we don't
// retry on every drawer-open.
const PHOTO_DIR = path.join(process.cwd(), 'public', 'listing-photos');

interface ListingRow {
  id: number;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

async function ensurePhotoDir(): Promise<void> {
  await fs.mkdir(PHOTO_DIR, { recursive: true });
}

async function findCachedFile(id: number): Promise<{ file: string; ext: string } | null> {
  for (const ext of ['jpg', 'png', 'webp']) {
    const file = path.join(PHOTO_DIR, `${id}.${ext}`);
    try {
      await fs.access(file);
      return { file, ext };
    } catch {
      // not present
    }
  }
  return null;
}

async function isSentinel(id: number): Promise<boolean> {
  try {
    await fs.access(path.join(PHOTO_DIR, `${id}.none`));
    return true;
  } catch {
    return false;
  }
}

function contentTypeForExt(ext: string): string {
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return 'image/jpeg';
}

function extForContentType(ct: string): string {
  if (ct.includes('png')) return 'png';
  if (ct.includes('webp')) return 'webp';
  return 'jpg';
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const id = Number(idStr);
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  // Phase timings, written to the dev server console. Good for measuring
  // where the time goes on a cold cache-miss request — see plan
  // notes/zesty-kindling-eagle for the original investigation.
  const totalLabel = `[photo:${id}:total]`;
  console.time(totalLabel);

  console.time(`[photo:${id}:ensureDir]`);
  await ensurePhotoDir();
  console.timeEnd(`[photo:${id}:ensureDir]`);

  // Sentinel check first — we tried before and got nothing.
  if (await isSentinel(id)) {
    console.timeEnd(totalLabel);
    return NextResponse.json({ error: 'no imagery available' }, { status: 404 });
  }

  // Disk cache hit?
  console.time(`[photo:${id}:cacheLookup]`);
  const cached = await findCachedFile(id);
  console.timeEnd(`[photo:${id}:cacheLookup]`);
  if (cached) {
    const bytes = await fs.readFile(cached.file);
    console.timeEnd(totalLabel);
    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': contentTypeForExt(cached.ext),
        'Cache-Control': 'public, immutable, max-age=31536000',
      },
    });
  }

  // Cache miss — look up the listing and fetch via MPP.
  console.time(`[photo:${id}:dbLookup]`);
  const row = await dbGet<ListingRow>(
    'SELECT id, address, latitude, longitude FROM housing_listings WHERE id = ?',
    id
  );
  console.timeEnd(`[photo:${id}:dbLookup]`);

  if (!row) {
    console.timeEnd(totalLabel);
    return NextResponse.json({ error: 'listing not found' }, { status: 404 });
  }

  try {
    console.time(`[photo:${id}:fetchListingPhoto]`);
    const result = await fetchListingPhoto(row.address, row.latitude, row.longitude);
    console.timeEnd(`[photo:${id}:fetchListingPhoto]`);

    if (!result) {
      // Mark sentinel and return 404
      await fs.writeFile(path.join(PHOTO_DIR, `${id}.none`), '');
      console.timeEnd(totalLabel);
      return NextResponse.json({ error: 'no imagery available' }, { status: 404 });
    }

    // Save to disk
    console.time(`[photo:${id}:diskWrite]`);
    const ext = extForContentType(result.contentType);
    const file = path.join(PHOTO_DIR, `${id}.${ext}`);
    await fs.writeFile(file, result.bytes);
    console.timeEnd(`[photo:${id}:diskWrite]`);

    console.timeEnd(totalLabel);
    return new NextResponse(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        'Content-Type': result.contentType,
        'Cache-Control': 'public, immutable, max-age=31536000',
        'X-Photo-Source': result.source,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown error';
    console.timeEnd(totalLabel);
    console.error(`[listing-photo:${id}] failed:`, message);
    return NextResponse.json(
      { error: 'photo fetch failed', detail: message },
      { status: 500 }
    );
  }
}
