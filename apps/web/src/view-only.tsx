// Режим «только просмотр» (роль директора). Кнопки изменений помечаются атрибутом data-edit и скрываются в director.css;
// хук нужен там, где меняется подпись или поведение. Сервер в любом случае отклоняет изменения директора.
import { createContext, useContext } from "react";

export const ViewOnly = createContext(false);
export const useViewOnly = () => useContext(ViewOnly);
