// Resolves the public IP that mediasoup announces to clients (ICE candidates).
// Order: IP env var -> EC2 instance metadata (IMDSv2) -> 127.0.0.1 (local dev only)

const IMDS = "http://169.254.169.254/latest";

let announcedIp = process.env.IP || "127.0.0.1";

async function fetchEc2PublicIp(): Promise<string | null> {
  try {
    const token = await fetch(`${IMDS}/api/token`, {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" },
      signal: AbortSignal.timeout(2000),
    }).then((r) => (r.ok ? r.text() : null));
    if (!token) return null;

    const res = await fetch(`${IMDS}/meta-data/public-ipv4`, {
      headers: { "X-aws-ec2-metadata-token": token },
      signal: AbortSignal.timeout(2000),
    });
    // 404 = instance has no public IP (private subnet)
    if (!res.ok) return null;

    const ip = (await res.text()).trim();
    return /^\d{1,3}(\.\d{1,3}){3}$/.test(ip) ? ip : null;
  } catch {
    // not running on EC2 (Hostinger, local, etc.)
    return null;
  }
}

export async function resolveAnnouncedIp(): Promise<string> {
  if (process.env.IP) {
    announcedIp = process.env.IP;
    console.info(`mediasoup announcedIp from env IP: ${announcedIp}`);
    return announcedIp;
  }

  const ec2Ip = await fetchEc2PublicIp();
  if (ec2Ip) {
    announcedIp = ec2Ip;
    console.info(`mediasoup announcedIp from EC2 metadata: ${announcedIp}`);
  } else {
    console.info(
      "mediasoup announcedIp: no IP env and no EC2 public IP found, using 127.0.0.1 (calls will only work locally)"
    );
  }
  return announcedIp;
}

export function getAnnouncedIp(): string {
  return announcedIp;
}
