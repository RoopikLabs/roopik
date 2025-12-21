import { useState } from "react";
import { useMount } from "react-use";
export const useRooPortal = (id) => {
    const [container, setContainer] = useState();
    useMount(() => setContainer(document.getElementById(id) ?? undefined));
    return container;
};
//# sourceMappingURL=useRooPortal.js.map