export type LikeItem = {
  id?: string;
  imageUrl: string;
  prompt: string;
  negativePrompt?: string;
  seed?: number;
  model?: string;
  author: string;
  authorUrl?: string;
  title?: string;
  createdAt?: string;
  sourceUrl?: string;
};

export type JimengLikeItem = {
  common_attr: {
    id: string;
    title: string;
    description: string;
    cover_url: string;
    cover_url_map: Record<string, string>;
    create_time: number;
    aspect_ratio: number;
  };
  aigc_image_params: {
    text2image_params: {
      prompt: string;
      user_negative_prompt: string;
      seed: number;
      model_config: {
        model_name: string;
        model_req_key: string;
      };
    };
  };
  image: {
    large_images: Array<{
      image_url: string;
      width: number;
      height: number;
      format: string;
    }>;
  };
  author: {
    name: string;
    avatar_url: string;
    sec_uid: string;
  };
};

export type JimengApiResponse = {
  ret: string;
  errmsg: string;
  data: {
    has_more: boolean;
    next_offset: number;
    item_list: JimengLikeItem[];
  };
};

export type ExportRequest = {
  type: "START_EXPORT";
  items?: LikeItem[];
  sourceUrl: string;
  tabId?: number;
  mode?: "zip" | "csv";
};

export type ExportProgress = {
  type: "EXPORT_PROGRESS";
  stage: "collecting" | "downloading" | "zipping" | "done" | "error";
  done: number;
  total: number;
  message?: string;
};

export type ExportResult = {
  type: "EXPORT_RESULT";
  success: boolean;
  error?: string;
};

export type CollectRequest = {
  type: "COLLECT_ITEMS";
};

export type CollectResponse = {
  type: "COLLECT_ITEMS_RESULT";
  items: LikeItem[];
  total: number;
};
