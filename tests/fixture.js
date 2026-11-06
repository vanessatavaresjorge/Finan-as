export const categories = [
  {id:'carro',name:'Carro',type:'out',icon:'🚗',savings:false,order:0},
  {id:'inv',name:'Investimentos',type:'out',icon:'📈',savings:true,order:1},
  {id:'salario',name:'Salário',type:'in',icon:'💼',savings:false,order:2}];
export const profiles = [{id:'a',name:'Ana'},{id:'b',name:'Rui'}];
let n = 0;
export const mv = (profileId, type, cents, categoryId, date, note = '') => ({id:String(++n), profileId, type, cents, categoryId, date, note, createdAt:n});
export const moves = [
  mv('a','in',200000,'salario','2026-11-01'), mv('a','out',30000,'carro','2026-11-03','pneus'),
  mv('a','out',50000,'inv','2026-11-10'),     mv('a','out',1000,'carro','2026-10-31'),
  mv('b','in',100000,'salario','2026-11-02'), mv('b','out',20000,'carro','2026-11-04','segredo-b')];
