import * as T from "three";
import { createCloudNoise } from "./CloudNoise";
import { fullscreenVertex, noiseGLSL } from "./core";
import {
  BOUNDS_MIN,
  BOUNDS_MAX,
  COUNT,
  type Sky,
  type SkyRenderer,
} from "./Sky";
export const skyGLSL = `
 precision highp float;varying vec2 vUv;
 uniform mat4 inverseProjection,cameraWorld;
 uniform vec3 sun,zenith,horizon,direct,shadow;
 uniform float time,exposure,coverage;
 uniform sampler2D atlas;uniform highp sampler3D shapeNoise;uniform float billow;
 ${noiseGLSL}
 const vec3 lo=vec3(-25,-3,-15),hi=vec3(25,14,8);
 float density(vec3 p){
  vec3 c=(p-lo)/(hi-lo);if(any(lessThan(c,vec3(0)))||any(greaterThan(c,vec3(1))))return 0.;
  vec3 g=c*vec3(255,127,127);float z=floor(g.z),z1=min(z+1.,127.);
  vec2 uv=(vec2(mod(z,16.),floor(z/16.))*vec2(256,128)+g.xy+.5)/vec2(4096,1024);
  vec2 uv1=(vec2(mod(z1,16.),floor(z1/16.))*vec2(256,128)+g.xy+.5)/vec2(4096,1024);
  float field=mix(texture2D(atlas,uv).r,texture2D(atlas,uv1).r,fract(g.z));if(field<-.65)return 0.;vec3 q=p*.17+vec3(time*.0007,0.,time*.0003*billow);float shape=dot(texture(shapeNoise,q).rgb,vec3(.62,.27,.11));return smoothstep(-.09,.23,field+(shape-.48)*1.65-(texture(shapeNoise,q*3.7).b-.4)*.18)*1.5*coverage;
 }
 vec2 intersect(vec3 ro,vec3 rd){vec3 a=(lo-ro)/rd,b=(hi-ro)/rd,mn=min(a,b),mx=max(a,b);return vec2(max(max(mn.x,mn.y),mn.z),min(min(mx.x,mx.y),mx.z));}
 vec3 skyColor(vec3 rd){
  float h=max(rd.y,0.);float alignment=max(dot(rd,sun),0.);
  vec3 color=mix(horizon,zenith,smoothstep(-.05,.8,pow(h,.55)));
  color+=direct*pow(alignment,12.)*.15+direct*pow(alignment,180.)*.24;
  color+=direct*smoothstep(.99976,.9999,alignment)*1.5;
  color=mix(zenith*.5+shadow*.10,color,smoothstep(-.26,.025,rd.y));
  float band=exp(-pow((rd.y+.04)*12.,2.));float wisps=fbm(vec3(rd.x*24.+time*.002,rd.y*75.,4.));
  color=mix(color,shadow*.8+horizon*.18,band*smoothstep(.4,.72,wisps)*.62);
  return color;
 }
 void main(){
  vec4 ray=inverseProjection*vec4(vUv*2.-1.,1.,1.);vec3 rd=normalize((cameraWorld*vec4(ray.xyz/ray.w,0.)).xyz),ro=cameraWorld[3].xyz;
  vec3 background=skyColor(rd),color=vec3(0);float trans=1.;vec2 hit=intersect(ro,rd);
  if(hit.y>max(hit.x,0.)){
   float stepSize=(hit.y-max(hit.x,0.))/256.;float t=max(hit.x,0.)+hash(vec3(gl_FragCoord.xy,0.))*stepSize;
   vec3 lightingSun=normalize(vec3(sun.x-.55,.52,.48));float alignment=dot(rd,lightingSun);float phase=.7+.75*pow(max(alignment,0.),8.);
   for(int i=0;i<256;i++){
    vec3 p=ro+rd*t;float d=density(p);
    if(d>.003){
     float optical=density(p+lightingSun*.4)*.4+density(p+lightingSun*1.05)*.65+density(p+lightingSun*2.)*.95+density(p+lightingSun*3.8)*1.8;
     float lighting=exp(-optical*2.25)*phase+exp(-optical*.45)*.12;
     vec3 shade=shadow*(.55+exp(-d*.7)*.36)+direct*lighting*.66;
     shade+=zenith*.16*clamp((p.y+1.)*.1,0.,1.);
     float alpha=1.-exp(-d*stepSize*1.35);color+=trans*shade*alpha;trans*=1.-alpha;if(trans<.008)break;
    }t+=stepSize;
   }
  }
  color+=background*trans;
  color*=exposure;
  color=clamp((color*(2.51*color+.03))/(color*(2.43*color+.59)+.14),0.,1.);
  color=pow(color,vec3(1./2.2));
  color+=(hash(vec3(gl_FragCoord.xy,1.))-.5)/255.;
  gl_FragColor=vec4(color,1.);
 }
`;
export class WebGLSky implements SkyRenderer {
  readonly kind = "WebGL 2";
  private renderer: T.WebGLRenderer;
  private noise = createCloudNoise();
  private target = new T.WebGLRenderTarget(4096, 1024, {
    type: T.HalfFloatType,
    depthBuffer: false,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
  });
  private scene = new T.Scene();
  private fieldScene = new T.Scene();
  private camera = new T.Camera();
  private material: T.ShaderMaterial;
  private field: T.ShaderMaterial;
  private lastRevision = -1;
  private fieldTime = -1;
  constructor(canvas: HTMLCanvasElement, sky: Sky) {
    this.renderer = new T.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: "low-power",
      preserveDrawingBuffer: true,
    });
    if (!this.renderer.extensions.has("EXT_color_buffer_float"))
      throw new Error("Floating-point render targets are unavailable.");
    this.field = new T.ShaderMaterial({
      vertexShader: fullscreenVertex,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        clouds: { value: sky.centers },
        shapeNoise: { value: this.noise },
        time: { value: 0 },
        billow: { value: 0 },
        lo: { value: new T.Vector3().fromArray(BOUNDS_MIN) },
        hi: { value: new T.Vector3().fromArray(BOUNDS_MAX) },
      },
      fragmentShader: `
  precision highp float;uniform highp sampler3D shapeNoise;uniform vec4 clouds[${COUNT}];uniform float time,billow;uniform vec3 lo,hi;
  void main(){vec2 pixel=floor(gl_FragCoord.xy),tile=floor(pixel/vec2(256,128));float z=tile.x+tile.y*16.;
   vec3 p=mix(lo,hi,vec3(mod(pixel,vec2(256,128)),z)/vec3(255,127,127));float field=-30.;
   for(int i=0;i<${COUNT};i++){float f=clouds[i].w-length((p-clouds[i].xyz)/vec3(1.18,.88,1.));float b=max(0.,.42-abs(field-f))/.42;field=max(field,f)+b*b*.105;}
   if(field<-.65){gl_FragColor=vec4(-2,0,0,1);return;}
   vec3 q=p*.17+vec3(time*.0007,0.,time*.0003*billow);vec3 cells=texture(shapeNoise,q).rgb;
   float shape=dot(cells,vec3(.62,.27,.11));float d=smoothstep(-.06,.22,field+(shape-.48)*1.65-(texture(shapeNoise,q*3.7).b-.4)*.18)*1.5;
   gl_FragColor=vec4(field,d,0,1.);
  }`,
    });
    this.material = new T.ShaderMaterial({
      vertexShader: fullscreenVertex,
      fragmentShader: skyGLSL,
      depthWrite: false,
      depthTest: false,
      uniforms: {
        inverseProjection: { value: sky.camera.projectionMatrixInverse },
        cameraWorld: { value: sky.camera.matrixWorld },
        sun: { value: sky.sunlight },
        zenith: { value: sky.colors[0] },
        horizon: { value: sky.colors[1] },
        direct: { value: sky.colors[2] },
        shadow: { value: sky.colors[3] },
        time: { value: 0 },
        exposure: { value: 1 },
        coverage: { value: 1 },
        atlas: { value: this.target.texture },
        shapeNoise: { value: this.noise },
        billow: { value: sky.settings.billow },
      },
    });
    this.scene.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.material));
    this.fieldScene.add(new T.Mesh(new T.PlaneGeometry(2, 2), this.field));
  }
  resize(w: number, h: number, ratio: number) {
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
  }
  render(sky: Sky) {
    if (
      sky.revision !== this.lastRevision &&
      (sky.time - this.fieldTime > 0.065 ||
        sky.time < this.fieldTime ||
        this.lastRevision < 0 ||
        sky.time === this.fieldTime)
    ) {
      this.fieldTime = sky.time;
      this.field.uniforms.time.value = sky.time;
      this.field.uniforms.billow.value = sky.settings.billow;
      this.renderer.setRenderTarget(this.target);
      this.renderer.render(this.fieldScene, this.camera);
      this.renderer.setRenderTarget(null);
      this.lastRevision = sky.revision;
    }
    this.material.uniforms.time.value = sky.time;
    this.material.uniforms.billow.value = sky.settings.billow;
    this.material.uniforms.exposure.value = sky.settings.exposure;
    this.material.uniforms.coverage.value =
      sky.settings.density === 0 ? 0 : 0.65 + sky.settings.density * 0.5;
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.target.dispose();
    this.noise.dispose();
    this.field.dispose();
    this.material.dispose();
    for (const scene of [this.scene, this.fieldScene])
      (scene.children[0] as T.Mesh).geometry.dispose();
    this.renderer.dispose();
  }
}
