export class UnsafeLink extends Error {}
export async function safeLinkFetch(start,{fetcher=fetch,method='HEAD',timeoutMs=15000}={}){
 let current=new URL(start);const seen=new Set();const deadline=Date.now()+timeoutMs;
 for(let hop=0;hop<6;hop++){
  if(current.protocol!=='https:'||current.username||current.password)throw new UnsafeLink('Unsafe link or redirect');
  if(seen.has(current.href))throw new UnsafeLink('Redirect loop');seen.add(current.href);
  const remaining=deadline-Date.now();if(remaining<=0)throw new Error('Link deadline');
  const response=await fetcher(current.href,{method,redirect:'manual',signal:AbortSignal.timeout(remaining)});
  if(![301,302,303,307,308].includes(response.status))return response;
  const next=response.headers.get('location');await response.body?.cancel();
  if(!next)throw new UnsafeLink('Unsafe redirect without Location');
  current=new URL(next,current);
 }
 throw new UnsafeLink('Redirect hop limit');
}
