export const common = `
struct Params {inv:mat4x4f,world:mat4x4f,sun:vec4f,zenith:vec4f,horizon:vec4f,direct:vec4f,shadow:vec4f};
@group(0) @binding(0) var<uniform> u:Params;
const lo=vec3f(-25,-3,-15);const hi=vec3f(25,14,8);
fn hash(p0:vec3f)->f32{var p=fract(p0*.3183099+vec3f(.1,.2,.3));p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
fn noise(p:vec3f)->f32 {let i=floor(p);var f=fract(p);f=f*f*(3.-2.*f);return mix(mix(mix(hash(i),hash(i+vec3f(1,0,0)),f.x),mix(hash(i+vec3f(0,1,0)),hash(i+vec3f(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3f(0,0,1)),hash(i+vec3f(1,0,1)),f.x),mix(hash(i+vec3f(0,1,1)),hash(i+vec3f(1,1,1)),f.x),f.y),f.z);}
fn fbm(p0:vec3f)->f32{var p=p0;var f=0.;var a=.5;for(var i=0;i<4;i++){f+=a*noise(p);p=p*2.03+vec3f(13.2,9.4,7.1);a*=.5;}return f;}
`;
export const fieldWGSL =
  common +
  `
@group(0) @binding(1) var<uniform> clouds:array<vec4f,48>;
@group(0) @binding(2) var shapeNoise:texture_3d<f32>;
@group(0) @binding(3) var noiseSampler:sampler;
@group(0) @binding(4) var output:texture_storage_3d<rgba16float,write>;
@compute @workgroup_size(4,4,4) fn main(@builtin(global_invocation_id) id:vec3u){
 if(any(id>=vec3u(256,128,128))){return;}
 let p=mix(lo,hi,vec3f(id)/vec3f(255,127,127));var field=-30.;
 for(var i=0;i<48;i++){let f=clouds[i].w-length((p-clouds[i].xyz)/vec3f(1.18,.88,1.));let b=max(0.,.42-abs(field-f))/.42;field=max(field,f)+b*b*.105;}
 if(field<-.65){textureStore(output,id,vec4f(-2,0,0,1));return;}
 let q=p*.17+vec3f(u.sun.w*.0007,0.,u.sun.w*.0003*u.direct.w);
 let cells=textureSampleLevel(shapeNoise,noiseSampler,q,0.).rgb;
 let shape=dot(cells,vec3f(.62,.27,.11));
 let d=smoothstep(-.06,.22,field+(shape-.48)*1.65-(textureSampleLevel(shapeNoise,noiseSampler,q*3.7,0.).b-.4)*.18)*1.5;
 textureStore(output,id,vec4f(field,d,0,1));
}`;
export const renderWGSL =
  common +
  `
@group(0) @binding(1) var volume:texture_3d<f32>;
@group(0) @binding(2) var volumeSampler:sampler;
@group(0) @binding(3) var shapeNoise:texture_3d<f32>;
@group(0) @binding(4) var noiseSampler:sampler;
fn density(p:vec3f)->f32 {let c=(p-lo)/(hi-lo);if(any(c<vec3f(0))||any(c>vec3f(1))){return 0.;}let field=textureSampleLevel(volume,volumeSampler,(c*vec3f(255,127,127)+.5)/vec3f(256,128,128),0.).r;if(field<-.65){return 0.;}let q=p*.17+vec3f(u.sun.w*.0007,0.,u.sun.w*.0003*u.direct.w);let shape=dot(textureSampleLevel(shapeNoise,noiseSampler,q,0.).rgb,vec3f(.62,.27,.11));return smoothstep(-.09,.23,field+(shape-.48)*1.65-(textureSampleLevel(shapeNoise,noiseSampler,q*3.7,0.).b-.4)*.18)*1.5*u.zenith.w;}
fn intersect(ro:vec3f,rd:vec3f)->vec2f{let a=(lo-ro)/rd;let b=(hi-ro)/rd;let mn=min(a,b);let mx=max(a,b);return vec2f(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));}
fn skyColor(rd:vec3f)->vec3f{
 let h=max(rd.y,0.);let alignment=max(dot(rd,u.sun.xyz),0.);
 var color=mix(u.horizon.xyz,u.zenith.xyz,smoothstep(-.05,.8,pow(h,.55)));
 color+=u.direct.xyz*pow(alignment,12.)*.15+u.direct.xyz*pow(alignment,180.)*.24;
 color+=u.direct.xyz*smoothstep(.99976,.9999,alignment)*1.5;
 color=mix(u.zenith.xyz*.5+u.shadow.xyz*.10,color,smoothstep(-.26,.025,rd.y));
 let band=exp(-pow((rd.y+.04)*12.,2.));let wisps=fbm(vec3f(rd.x*24.+u.sun.w*.002,rd.y*75.,4.));
 return mix(color,u.shadow.xyz*.8+u.horizon.xyz*.18,band*smoothstep(.4,.72,wisps)*.62);
}
struct VertexOut {@builtin(position) position:vec4f,@location(0) uv:vec2f};
@vertex fn vertex(@builtin(vertex_index) id:u32)->VertexOut {
 var points=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));var out:VertexOut;out.position=vec4f(points[id],0,1);out.uv=points[id]*.5+.5;return out;
}
@fragment fn fragment(in:VertexOut)->@location(0) vec4f{
 let ray=u.inv*vec4f(in.uv*2.-1.,1,1);let rd=normalize((u.world*vec4f(ray.xyz/ray.w,0)).xyz);let ro=u.world[3].xyz;
 let background=skyColor(rd);var color=vec3f(0);var trans=1.;let hit=intersect(ro,rd);
 if(hit.y>max(hit.x,0.)){
  let stepSize=(hit.y-max(hit.x,0.))/256.;var t=max(hit.x,0.)+hash(vec3f(in.position.xy,0))*stepSize;
  let lightingSun=normalize(vec3f(u.sun.x-.55,.52,.48));let phase=.7+.75*pow(max(dot(rd,lightingSun),0.),8.);
  for(var i=0;i<256;i++){
   let p=ro+rd*t;let d=density(p);
   if(d>.003){
    let optical=density(p+lightingSun*.4)*.4+density(p+lightingSun*1.05)*.65+density(p+lightingSun*2.)*.95+density(p+lightingSun*3.8)*1.8;
    let lighting=exp(-optical*2.25)*phase+exp(-optical*.45)*.12;
    var shade=u.shadow.xyz*(.55+exp(-d*.7)*.36)+u.direct.xyz*lighting*.66;
    shade+=u.zenith.xyz*.16*clamp((p.y+1.)*.1,0.,1.);
    let alpha=1.-exp(-d*stepSize*1.35);color+=trans*shade*alpha;trans*=1.-alpha;if(trans<.008){break;}
   }t+=stepSize;
  }
 }
 color+=background*trans;color*=u.horizon.w;
 color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),vec3f(0),vec3f(1));
 color=pow(color,vec3f(1./2.2));color+=(hash(vec3f(in.position.xy,1))-.5)/255.;return vec4f(color,1);
}`;
