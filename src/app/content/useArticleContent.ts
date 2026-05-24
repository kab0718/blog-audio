import { useEffect, useState } from "react";
import { loadArticleContent } from "../../content/articleContentService";
import type { Article } from "../../types/article";
import type { ArticleContentResult } from "../../types/articleContent";

export type ArticleContentLoadState =
  | {
      status: "idle";
      content: null;
      errorMessage: null;
    }
  | {
      status: "loading";
      content: ArticleContentResult | null;
      errorMessage: null;
    }
  | {
      status: "success" | "fallback";
      content: ArticleContentResult;
      errorMessage: null;
    }
  | {
      status: "failed";
      content: ArticleContentResult | null;
      errorMessage: string;
    };

export function useArticleContent(article: Article | null) {
  const [state, setState] = useState<ArticleContentLoadState>({
    status: "idle",
    content: null,
    errorMessage: null,
  });

  useEffect(() => {
    if (!article) {
      setState({
        status: "idle",
        content: null,
        errorMessage: null,
      });
      return;
    }

    let isActive = true;

    setState((currentState) => ({
      status: "loading",
      content: currentState.content,
      errorMessage: null,
    }));

    loadArticleContent(article).then((content) => {
      if (!isActive) {
        return;
      }

      if (content.status === "failed") {
        setState({
          status: "failed",
          content,
          errorMessage: content.errorMessage,
        });
        return;
      }

      setState({
        status: content.status,
        content,
        errorMessage: null,
      });
    });

    return () => {
      isActive = false;
    };
  }, [article]);

  return state;
}
