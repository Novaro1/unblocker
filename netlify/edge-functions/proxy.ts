export default async (request: Request) => {
  const url = new URL(request.url);
  url.hostname = "veilub.mooo.com";
  url.protocol = "https:";
  url.port = "";
  return fetch(new Request(url, request));
};

export const config = { path: "/*" };
