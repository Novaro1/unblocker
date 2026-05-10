export async function iboss(url) {
  const domain = url.replace(/^https?:\/\//, "").split("/")[0];
  const res = await fetch(
    `https://cluster122287-swg.ibosscloud.com:8026/json/mobileClient/performUrlFiltering?securityKey=29XA3PD231&userEmail=yo&overrideRequest=false&url=${encodeURIComponent(domain)}`
  );
  const json = await res.json();
  return {
    category: json.blockReason || "iBoss",
    blocked: json.blockUrl !== 0,
  };
}
