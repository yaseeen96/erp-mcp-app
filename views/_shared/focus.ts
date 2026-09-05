export function wantsTopic<T extends string>(topics: T[] | undefined, topic: T): boolean {
  return !topics?.length || topics.includes(topic);
}
