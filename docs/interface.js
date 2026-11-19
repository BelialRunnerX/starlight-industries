"use strict";
const form=document.getElementById("controls");
const by=id=>document.getElementById(id);
const fields=["size","speed","budget"];
const n=(x,dec=3)=>Number.isFinite(x)?x.toFixed(dec):"–";
function sync(){for(const field of fields)by(field+"-value").textContent=n(Number(by(field).value),2);}
function clearResult(message){
 by("status").textContent=message;
 for(const id of ["energy","result-speed","evaluated","shape"])by(id).textContent="–";
 for(const id of ["trace","area"])by(id).setAttribute("d","");
 by("plot").setAttribute("aria-label","No feasible field profile to display.");
}
function render(){
 const inputs=Object.fromEntries(fields.map(field=>[field,Number(by(field).value)]));
 const toy=window.StarlightToy;
 if(!fields.every(field=>by(field).value.trim()!=="" && Number.isFinite(inputs[field]) &&
     inputs[field]>=Number(by(field).min) && inputs[field]<=Number(by(field).max)) ||
     !toy || inputs.size<toy.MIN_SIZE){
   clearResult("Choose valid slider values, with interior width at least 0.01.");
   return;
 }
 let r;
 try { r=toy.optimize(inputs); }
 catch(error) {
   if(!(error instanceof RangeError)) throw error;
   clearResult(error.message);
   return;
 }
 const best=r.best;
 by("status").textContent=best?"Feasible within the toy model. Lowest energy among evaluated candidates.":r.reason;
 by("energy").textContent=best?n(best.energy):"–";by("result-speed").textContent=best?n(best.speed):"–";
 by("evaluated").textContent=r.evaluated+" / "+r.tested;
 by("shape").textContent=best?"Shape: core "+n(best.shape.core,2)+" · wall "+n(best.shape.wall,2)+" · roundness "+n(best.shape.roundness,2):"Try adjusting the target or budget.";
 const pts=best?best.profile.map(p=>[42+564*p.x,200-168*p.y]):[];
 const line=pts.map((p,i)=>(i?"L":"M")+p[0].toFixed(2)+" "+p[1].toFixed(2)).join(" ");
 by("trace").setAttribute("d",line);by("area").setAttribute("d",pts.length?line+" L606 200 H42 Z":"");
 by("plot").setAttribute("aria-label",best?"Field profile for lowest-energy evaluated toy candidate.":"No feasible field profile to display.");
}
form.addEventListener("input",()=>{sync();by("status").textContent="Parameters changed. Run a new search to update the result.";});
form.addEventListener("submit",e=>{e.preventDefault();render();});
sync();render();
