export async function api(path, options={}) {
  const token=sessionStorage.getItem('token');
  const res=await fetch('/api'+path,{
    ...options,
    headers:{'Content-Type':'application/json',
      ...(token?{Authorization:'Bearer '+token}:{}),...options.headers},
    body:options.body===undefined?undefined:JSON.stringify(options.body)
  });
  const value=await res.json();
  if(!res.ok) {
    if(res.status===401 && path!=='/auth/login') {
      sessionStorage.removeItem('token');
      window.dispatchEvent(new Event('signed-out'));
    }
    throw new Error(value.error || 'Request failed');
  }
  return value;
}
