// One hundred additional design variants on the existing Node/PostgreSQL stack.
// Each key is the original root cause, not an independent scoring root.
export const groups={
 sql:{
  R0001:['B0002','B0007','B0008','B0009','B0010','B0011','B0012','B0015'],
  R0003:['B0004','B0014','B0016','B0017','B0018'],
  R0005:['B0013','B0019'],R0006:['B0020']
 },
 browser:{
  R0021:['B0032','B0033','B0037','B0039','B0040'],R0022:['B0024'],
  R0027:['B0028','B0030'],R0034:['B0035','B0036','B0038'],
  R0041:['B0042','B0045'],R0050:['B0051','B0052'],R0061:['B0069','B0070']
 },
 files:{
  R0121:['B0122','B0125','B0128','B0129','B0130','B0131','B0134','B0140'],
  R0123:['B0136'],R0126:['B0139']
 },
 ssrf:{
  R0117:['B0120','B0161','B0173','B0174','B0175'],
  R0162:['B0177'],R0164:['B0165','B0166'],R0167:['B0180']
 },
 auth:{
  R0046:['B0214','B0215','B0216'],R0094:['B0094','B0288','B0295','B0304'],
  R0095:['B0297','B0298','B0299'],R0184:['B0192'],R0198:['B0205','B0213','B0257'],
  R0208:['B0209','B0231','B0345','B0454'],R0228:['B0229','B0302'],
  R0271:['B0274','B0276','B0277','B0278','B0286','B0289'],
  R0291:['B0292','B0293','B0294']
 },
 csrf:{
  R0311:['B0312','B0315','B0317','B0318','B0327'],
  R0319:['B0320','B0321','B0322'],R0333:['B0334','B0335','B0336']
 },
 cache:{
  R0371:['B0372','B0373','B0374','B0375','B0376','B0385','B0386','B0388']
 }
};
export const selected=Object.entries(groups).flatMap(([group,roots])=>Object.entries(roots).flatMap(([root,variants])=>variants.map(variant=>({group,root,variant}))));
if(selected.length!==100||new Set(selected.map(item=>item.variant)).size!==100)throw new Error('Batch 04 must select exactly 100 distinct variants');
