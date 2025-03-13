// src/utils/deviceUid.js
import Cookies from 'js-cookie';
import { v4 as uuidv4 } from 'uuid';

export const getDeviceUid = () => {
  let deviceUid = Cookies.get('deviceUid');
  if (!deviceUid) {
    deviceUid = uuidv4();
    // Se guarda la cookie por 365 días
    Cookies.set('deviceUid', deviceUid, { expires: 365 });
  }
  return deviceUid;
};
