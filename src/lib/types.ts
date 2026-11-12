interface WorkDetail {
  title: string;
  value: string;
}

export interface Work {
  title: string;
  siteLink: string;
  details: WorkDetail[];
  img: string;
  summary: string;
}
