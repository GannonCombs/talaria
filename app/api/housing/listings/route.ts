import { NextRequest, NextResponse } from 'next/server';
import { fetchListings } from '@/lib/modules/housing/rentcast';

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const zip = params.get('zip');
  const city = params.get('city');
  const state = params.get('state');
  const bookmarksOnly = params.get('bookmarksOnly') === 'true';

  // At least one of (zip) or (city+state) is required, UNLESS bookmarksOnly
  // is on — in which case we span the entire cache so any bookmark is
  // reachable. Backward compat: existing zip-only callers still work.
  if (!zip && !(city && state) && !bookmarksOnly) {
    return NextResponse.json(
      { error: 'zip OR (city + state) required, unless bookmarksOnly is on' },
      { status: 400 }
    );
  }

  const propertyTypesParam = params.get('propertyTypes');
  const hasHoaParam = params.get('hasHoa');

  const listings = await fetchListings(
    { zip, city, state },
    {
      minPrice: params.get('minPrice') ? Number(params.get('minPrice')) : undefined,
      maxPrice: params.get('maxPrice') ? Number(params.get('maxPrice')) : undefined,
      minBeds: params.get('minBeds') ? Number(params.get('minBeds')) : undefined,
      minBaths: params.get('minBaths') ? Number(params.get('minBaths')) : undefined,
      minSqft: params.get('minSqft') ? Number(params.get('minSqft')) : undefined,
      maxDom: params.get('maxDom') ? Number(params.get('maxDom')) : undefined,
      yearMin: params.get('yearMin') ? Number(params.get('yearMin')) : undefined,
      yearMax: params.get('yearMax') ? Number(params.get('yearMax')) : undefined,
      minLotSqft: params.get('minLotSqft') ? Number(params.get('minLotSqft')) : undefined,
      maxHoa: params.get('maxHoa') ? Number(params.get('maxHoa')) : undefined,
      hasHoa: hasHoaParam === 'yes' || hasHoaParam === 'no' ? hasHoaParam : undefined,
      propertyTypes: propertyTypesParam ? propertyTypesParam.split(',').filter(Boolean) : undefined,
      bookmarksOnly,
    }
  );

  return NextResponse.json(listings);
}
