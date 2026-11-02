/** Private tunnel credentials live only in this page's memory. */
export class RemoteConnection {
  constructor(fetcher=globalThis.fetch.bind(globalThis)){this.fetcher=fetcher;this.base='';this.key='';}
  async connect(address,key){
    let url;
    try{url=new URL(address);}catch{throw Error('Enter your HTTPS tunnel address.');}
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/')throw Error('Enter an HTTPS tunnel address without a path.');
    if(!/^[a-f0-9]{64}$/.test(key))throw Error('Enter the 64-character private access key.');
    this.base=url.origin;this.key=key;
    try{const response=await this.request('/api/dj/state');if(!response.ok)throw Error('Could not connect. Check the tunnel and access key.');}
    catch(error){this.disconnect();throw Error(error.message||'Could not connect. Check the tunnel and access key.');}
  }
  disconnect(){this.base='';this.key='';}
  async request(path,options={}){
    if(!this.base||!this.key)throw Error('Connect your private AI DJ first.');
    if(typeof path!=='string'||!/^\/api\/dj\/[a-zA-Z0-9_/-]+$/.test(path)||path.includes('..'))throw Error('Invalid DJ request.');
    const headers=new Headers(options.headers);headers.set('Authorization','Bearer '+this.key);
    return this.fetcher(this.base+path,{...options,headers,credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer'});
  }
}
