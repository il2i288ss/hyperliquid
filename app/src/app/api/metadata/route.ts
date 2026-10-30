import { NextResponse } from "next/server";

/**
 * Uploads the token image, then the Metaplex-style metadata JSON, to IPFS via
 * Pinata. Returns the metadata URI that goes on-chain.
 * Keeps PINATA_JWT on the server so it never reaches the browser.
 */
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

async function pin(body: FormData | string, json: boolean) {
  const res = await fetch(
    json
      ? "https://api.pinata.cloud/pinning/pinJSONToIPFS"
      : "https://api.pinata.cloud/pinning/pinFileToIPFS",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.PINATA_JWT}`,
        ...(json ? { "Content-Type": "application/json" } : {}),
      },
      body,
    },
  );
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status}`);
  const { IpfsHash } = await res.json();
  return `https://gateway.pinata.cloud/ipfs/${IpfsHash}`;
}

export async function POST(req: Request) {
  if (!process.env.PINATA_JWT) {
    return NextResponse.json({ error: "Server missing PINATA_JWT" }, { status: 500 });
  }
  const form = await req.formData();
  const name = String(form.get("name") ?? "").trim().slice(0, 32);
  const symbol = String(form.get("symbol") ?? "").trim().toUpperCase().slice(0, 10);
  const description = String(form.get("description") ?? "").slice(0, 500);
  const image = form.get("image");

  if (!name || !symbol) return NextResponse.json({ error: "Name and ticker are required" }, { status: 400 });
  if (!(image instanceof File) || !image.type.startsWith("image/"))
    return NextResponse.json({ error: "Upload an image" }, { status: 400 });
  if (image.size > MAX_IMAGE_BYTES)
    return NextResponse.json({ error: "Image must be under 2 MB" }, { status: 400 });

  try {
    const fileForm = new FormData();
    fileForm.append("file", image, image.name);
    const imageUri = await pin(fileForm, false);

    const links = {
      website: String(form.get("website") ?? ""),
      twitter: String(form.get("twitter") ?? ""),
      telegram: String(form.get("telegram") ?? ""),
    };
    const metadata = {
      name,
      symbol,
      description,
      image: imageUri,
      extensions: links,
      properties: { files: [{ uri: imageUri, type: image.type }], category: "image" },
    };
    const uri = await pin(JSON.stringify({ pinataContent: metadata }), true);
    return NextResponse.json({ uri, imageUri });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
