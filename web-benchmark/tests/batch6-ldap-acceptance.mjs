// Keep the representative LDAP checks aligned with the individual
// OpenLDAP-backed cases in batch6-ldap.mjs.
const base='dc=benchmark,dc=test';
const probes={
  R0099:{normal:{uid:'alice'},boundary:{uid:'alice)(uid=bob'},blockedStatus:200},
  R0100:{normal:{attribute:'uid',value:'alice'},boundary:{attribute:'description',value:'private'},blockedStatus:400},
  R0101:{normal:{rdn:'alice'},boundary:{rdn:'bob,ou=teamB'},blockedStatus:200},
  R0102:{normal:{base:'ou=teamA,'+base},boundary:{base:'ou=teamB,'+base},blockedStatus:400}
};

export const checks=Object.fromEntries(Object.entries(probes).map(([root,probe])=>[root,async t=>{
  await t.login();
  const normal=await t.post('/ldap-workbook',probe.normal);
  t.check(normal.status()===200,'Normal LDAP workbook request succeeds');
  const normalBody=await normal.json();
  t.check(Array.isArray(normalBody.rows)&&normalBody.rows.length>0,'Normal LDAP search returns a permitted entry');
  const boundary=await t.post('/ldap-workbook',probe.boundary);
  t.check(boundary.status()===(t.v?200:probe.blockedStatus),'LDAP boundary response agrees with arm');
  const state=(await t.oracle()).caseState.batch6Ldap;
  t.check(state.records.length>=1,'OpenLDAP operation is recorded in the private oracle');
  t.check(state.records.at(-1).variant==='B'+root.slice(1),'Oracle record belongs to the selected LDAP variant');
  t.check(state.records.at(-1).hasBob===t.v,'Other-OU Bob entry is reached only in V');
}]));
