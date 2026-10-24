import {
  articleCardParams,
  articleCardResponse,
  type ArticleCardParams,
} from "../../../../article-card";

export const dynamic = "force-static";
export const dynamicParams = false;

export function generateStaticParams() {
  return articleCardParams("en");
}

export function GET(_: Request, { params }: { params: ArticleCardParams }) {
  return articleCardResponse("en", params);
}
