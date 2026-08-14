export function createMaskedDestinationDelivery({
  getIsStandalone,
  routeManagedDestination,
  navigate,
}) {
  return async (url) => {
    if (getIsStandalone()) {
      navigate(url);
      return;
    }
    await routeManagedDestination(url);
  };
}
