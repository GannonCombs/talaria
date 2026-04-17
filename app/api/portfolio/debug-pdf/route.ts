import { NextRequest, NextResponse } from 'next/server';

// Temporary debug endpoint — shows raw text extracted from a PDF.
// Upload a PDF and see what pdf-parse gives us.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);

  return NextResponse.json({
    pages: data.numpages,
    textLength: data.text.length,
    // Show first 2000 chars to see the format
    textPreview: data.text.slice(0, 2000),
    // Also show lines to see row structure
    lines: data.text.split('\n').slice(0, 80),
  });
}
