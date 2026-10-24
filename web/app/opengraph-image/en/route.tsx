import { socialCard } from "../card";

export const dynamic = "force-static";

export function GET() {
  return socialCard("en");
}
