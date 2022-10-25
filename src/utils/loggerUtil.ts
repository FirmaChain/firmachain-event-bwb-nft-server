const ignoreRouteList = ['/requests', '/gallery/latest', '/gallery/latest/featured'];

export const isIgnoreRoute = (route: string): boolean => {
  if (route === '/') return true;

  for (let i = 0; i < ignoreRouteList.length; i++) {
    if (route.includes(ignoreRouteList[i])) {
      return true;
    }
  }

  return false;
};
