const n = {
  CLIENT_ID: 'b42bc0816a2a469293f1766e14cd26fd',
  CLIENT_SECRET: 'LqX1Hli4X3I1HPAbh9aaOhK6aWvZO2ep',
};
async function s() {
  try {
    return { client_id: n.CLIENT_ID, client_secret: n.CLIENT_SECRET };
  } catch (e) {
    console.error('Error getting keys:', e);
  }
}
async function l() {
  const e = await s();
  if (e) {
    const { client_id: o, client_secret: c } = e,
      a = 'https://us.battle.net/oauth/token',
      r = btoa(`${o}:${c}`);
    try {
      const t = await fetch(a, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${r}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
      });
      if (t.ok) return (await t.json()).access_token;
      throw new Error(await t.text());
    } catch (t) {
      console.log(t);
    }
  }
}
export { l as g };
