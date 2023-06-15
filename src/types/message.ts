export interface MessageEvent {
  type: string;
  channel: string;
  user: string;
  text: string;
  ts: string;
  edited?: Edited;
}

export interface Edited {
  user: string;
  ts: string;
}
