/* Starlight Industries: dimensionless fictional field optimization. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StarlightToy = api;
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";

  const MIN_SIZE = 0.01;
  const LIMIT = 0.98;
  const MAX_SLOPE = 10;
  const N = 96;
  const EPS = 1e-10;

  function validate({size, speed, budget} = {}) {
    if (![size, speed, budget].every(v => typeof v === "number" && Number.isFinite(v) &&
        v >= 0 && v <= 1) || size < MIN_SIZE) {
      throw new RangeError("Use dimensionless inputs: size in [0.01,1], speed and budget in [0,1].");
    }
    return {size, speed, budget};
  }

  function shapeAt(z, {core, wall, roundness}) {
    const t = (z - core) / wall;
    if (t <= 0) return [1, 0];
    if (t >= 1) return [0, 0];
    const cubic = 1 - t*t*(3-2*t);
    const quintic = 1 - t*t*t*(10+t*(-15+6*t));
    return [(1-roundness)*cubic+roundness*quintic,
      -((1-roundness)*6*t*(1-t)+roundness*30*t*t*(1-t)*(1-t))/wall];
  }

  function screen(shape, inputs) {
    const {core, wall, roundness} = shape;
    const eff = 0.58 + 0.52*core + 0.28*wall + 0.1*roundness;
    const peak = inputs.speed / eff;
    const slope = peak * (1.5 + .375*roundness)/wall;
    const admissible = core + EPS >= inputs.size && core + wall <= 1+EPS && peak <= LIMIT+EPS && slope <= MAX_SLOPE+EPS;
    return {peak, slope, speed: peak*eff, admissible};
  }

  function energyOf(shape, peak) {
    // The toy objective is a specified finite quadrature, not a continuum claim.
    let sum = 0;
    for (let idx=0; idx<=N; idx++) {
      const [a, d] = shapeAt(idx/N, shape);
      const weight = (idx === 0 || idx === N) ? .5 : 1;
      sum += weight*(a*a + .012*d*d);
    }
    return peak*peak*sum/N;
  }

  const dimensions = [
    [.15, .20, .25, .30, .35, .40, .45, .50, .55, .60, .65],
    [.15, .20, .25, .30, .35, .40, .45, .50, .55, .60, .65],
    [0, .25, .50, .75, 1]
  ];

  const kernel = (a,b) => Math.exp(-.5*(((a.core-b.core)/.16)**2 +
        ((a.wall-b.wall)/.16)**2 + ((a.roundness-b.roundness)/.45)**2));

  function fitGP(rows) {
    const n=rows.length;
    const mean=rows.reduce((acc,r)=>acc+r.energy,0)/n;
    const std=Math.sqrt(rows.reduce((acc,r)=>acc+(r.energy-mean)**2,0)/n) || 1;
    const L=Array.from({length:n},()=>new Float64Array(n));
    for(let i=0;i<n;i++) for(let j=0;j<=i;j++) {
      let value=kernel(rows[i].shape,rows[j].shape)+(i===j?1e-7:0);
      for(let k=0;k<j;k++) value-=L[i][k]*L[j][k];
      L[i][j]=i===j?Math.sqrt(value):value/L[j][j];
    }
    function forward(b) {
      const y=new Float64Array(n);
      for(let i=0;i<n;i++) {
        let v=b[i]; for(let k=0;k<i;k++) v-=L[i][k]*y[k];
        y[i]=v/L[i][i];
      }
      return y;
    }
    const u=forward(rows.map(r=>(r.energy-mean)/std));
    const alpha=new Float64Array(n);
    for(let i=n-1;i>=0;i--){
      let v=u[i]; for(let k=i+1;k<n;k++) v-=L[k][i]*alpha[k];
      alpha[i]=v/L[i][i];
    }
    return shape=>{
      const k=rows.map(row=>kernel(shape,row.shape));
      const v=forward(k);
      let mu=0, s2=1;
      for(let i=0;i<n;i++){mu+=k[i]*alpha[i];s2-=v[i]*v[i];}
      return mean+std*(mu-.65*Math.sqrt(Math.max(0,s2)));
    };
  }

  function optimize(raw) {
    const inputs=validate(raw);
    const grid=[];
    // The section is normalized to [0,1]. The plateau spans shape.core of it.
    const cores = [...new Set([...dimensions[0],inputs.size])].sort((a,b)=>a-b);
    for(const core of cores)
      for(const wall of dimensions[1])
        for(const roundness of dimensions[2]){
          if (core+wall>1+EPS) continue;
          const shape={core,wall,roundness};
          grid.push({shape,...screen(shape,inputs)});
        }
    const eligible=grid.filter(c=>c.admissible);
    const proposals=[];
    const checked=new Set();
    function audit(c) {
      const fresh=screen(c.shape,inputs);
      const energy=energyOf(c.shape,fresh.peak);
      checked.add(c);
      proposals.push({shape:c.shape,energy,peak:fresh.peak,slope:fresh.slope,speed:fresh.speed,
        margin:inputs.budget-energy,feasible:fresh.admissible && energy<=inputs.budget});
    }

    // Systematic seeds, then two GP-ranked passes; ranking never establishes feasibility.
    const seeds=Math.min(18,eligible.length);
    for(let i=0;i<seeds;i++) audit(eligible[Math.floor((i+.5)*eligible.length/seeds)]);
    for(let round=0;round<2 && proposals.length<eligible.length;round++){
      const rank=fitGP(proposals);
      const ranked=eligible.filter(c=>!checked.has(c)).map(c=>[c,rank(c.shape)]);
      ranked.sort((a,b)=>a[1]-b[1]);
      for(const [c] of ranked.slice(0,12)) audit(c);
    }
    const best0=proposals.filter(p=>p.feasible).sort((a,b)=>a.energy-b.energy)[0];
    const best=best0?{...best0,profile:Array.from({length:101},(_,i)=>({
      x:i/100,y:best0.peak*shapeAt(Math.abs(i/50-1),best0.shape)[0]}))}:null;
    const reason=best?null:eligible.length===0?"No shape meets this minimum interior width and the toy peak and wall-slope limits.":
      "No evaluated shape fits this energy budget.";
    return {feasible:!!best,best,proposals,tested:grid.length,evaluated:proposals.length,reason,inputs};
  }
  return {optimize, MIN_SIZE};
});
