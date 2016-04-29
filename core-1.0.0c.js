//Para el despliegue en producción pasarlo por:
//http://fmarcia.info/jsmin/test.html
//en nivel conservative
//y guardarlo en core.min.js
//También se puede pasar por
//http://lisperator.net/uglifyjs/#demo
//para ofuscarlo un poco más, fuente en: https://github.com/mishoo/UglifyJS2

//{
//  environment : 'development'|'test'|'live',
//  debug : true|false,
//  token : '',
//}

function PicardWidget (data) {

  try {

    //El log hay que definirlo antes porque se ejecuta al inicializar el objeto, antes de definir los metodos
    var log = function(value, type, parent) {
      try{
        switch(type) {
          case 'E':
            if (parent.DEBUG) console.error(value);
            break;
          case 'I':
            if (parent.DEBUG) console.info(value);
            break;
          case 'W':
            console.warn(value);
            break;
          default:
            if (parent.DEBUG) console.log(value);
        }
      } catch (e) {}
    }

    //CONFIGURACIONES E INICIALIZACIÓN

    // Propiedades
    var ready;  // Indica si el objeto esta inicializado correctamente
    var activeProcess = { // Indica si un determinado proceso esta lanzado (evita los dobles envios).
      doPayment: false,
      doRefund: false,
      getCardType: false,
      getCardTypeAirline: false,
      createClientCard: false,
      deleteClientCard: false,
      getClientCards: false,
      getInstallment: false,
      getScoringData: false,
      getTicket: false //Permite saber si se ha realizado un cobro. En caso afirmativo, deja ejecutar el metodo getTicket.
    };

    log("Initializing PicardWidget",'I', this);
    log(data,'I', this);
    ready = true;

    //Validar el objeto de entrada
    if(!data || typeof(data) != 'object') {
      ready = false;
      log('Incorrect input object', 'E', this);
    }

    if(!data.token || data.token.length != 32) {
      ready = false;
      log('Invalid token session', 'E', this);
    }

    //Cargar las propiedades con el objeto de entrada
    this.DEBUG = (data.debug===true?true:false);
    this.TOKEN = (data.token?data.token:'');

    switch(data.environment) {
      case 'development':
        this.HOST_ENVIRONMENT = "http://192.168.153.17:8080/picardwidget";
        //this.HOST_ENVIRONMENT = "http://10.80.70.37:8080/picardwidget";
        break;
      case 'test':
        //this.HOST_ENVIRONMENT = "https://picardwidget.globalia-corp.com";
        this.HOST_ENVIRONMENT = "http://192.168.153.13:8080/picardwidget";
        break;
      case 'live':
        this.HOST_ENVIRONMENT = "https://picardwidget.globalia-corp.com";
        break;
      default:
        ready = false;
        log('Invalid environment', 'E', this);
    }

    //TO-DO declarar variable de sesión XSID y enviarla siempre al llamar al backend

    //MÉTODOS PÚBLICOS

    //isCardValid: (SINCRONO) Valida si los datos de tarjetas, fecha de caducidad y cvv son correctos.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber: numero de tarjeta
    // * expiryDate: fecha de caducidad de la tarjeta
    // * cvv: codigo de validación
    //
    //La función retorna un objeto con los siguientes campos:
    // * isValid: Indica si la tarjeta, fecha de caducidad y cvv en su conjunto es
    //   correcto. En caso de no serlo consultar los demas campos para determinar el motivo.
    // * isCardLengthValid: Indica si la longitud de la tarjeta es valida.
    // * isCardNumeric: Indica si la tarjeta es númerica
    // * isCardLuhnValid: Indica si el número de tarjeta ha pasado el algoritmo Luhn.
    // * isExpiryDateValid: Indica si la fecha de caducidad de la tarjeta es valida.
    // * isCVVValid: Indica si el cvv es válido.
    this.isCardValid = function(data){

      var isValid, isCardLengthValid, isCardNumeric, isCardLuhnValid, isExpiryDateValid,
          isCVVValid, mm, yy, success, resultCode='', errorMessage='', now, nowmm,
          nowyy;

      try {

        log('isCardValid start', 'I', this);
        log(data, 'I', this);

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la longitud de la tarjeta
        isCardLengthValid = (data.cardNumber && data.cardNumber.length >= 14 && data.cardNumber.length <= 19);
        //Validar si la tarjeta es númerica
        isCardNumeric = (data.cardNumber && !isNaN(data.cardNumber));
        //Validar si la tarjeta cumple el algoritmo Luhn
        isCardLuhnValid = (data.cardNumber && validateLuhn(data.cardNumber));

        //Validar la fecha de caducidad de la tarjeta. Opcional
        if (!data.expiryDate)
          isExpiryDateValid = true;
        else {
          isExpiryDateValid = (data.expiryDate && data.expiryDate.length == 4);
          if (isExpiryDateValid) {
            mm = data.expiryDate.substr(0,2); yy = data.expiryDate.substr(2,2);
            now = new Date();
            nowmm = now.getMonth()+1; nowyy = (''+now.getFullYear()).substr(2,3);
            isExpiryDateValid = (isExpiryDateValid && !isNaN(mm) && parseInt(mm) >= 1 && parseInt(mm) <= 12);
            isExpiryDateValid = (isExpiryDateValid && !isNaN(yy) && parseInt(yy) >= 1);
            if (isExpiryDateValid && parseInt(yy) < parseInt(nowyy))
              isExpiryDateValid = false;
            if (isExpiryDateValid && parseInt(yy) == parseInt(nowyy) && parseInt(mm) < parseInt(nowmm))
              isExpiryDateValid = false;
          }
        }

        //Validar cvv. Opcional
        if (!data.cvv)
          isCVVValid = true;
        else {
          isCVVValid = (data.cvv.length >= 3 && data.cvv.length <= 4);
          isCVVValid = (isCVVValid && !isNaN(data.cvv));
        }

        //Resultado de la validación
        isValid = (isCardLengthValid && isCardNumeric && isCardLuhnValid && isExpiryDateValid && isCVVValid);

        //Logear resultado de la operación
        log('The credit card is '+(isValid?'valid':'invalid'), 'I', this);
        log('isCardLengthValid: '+isCardLengthValid, 'I', this);
        log('isCardNumeric: '+isCardNumeric, 'I', this);
        log('isCardLuhnValid: '+isCardLuhnValid, 'I', this);
        log('isExpiryDateValid: '+isExpiryDateValid, 'I', this);
        log('isCVVValid: '+isCVVValid, 'I', this);

        // Operación ejecutada correctamente
        success = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        isValid = isCardLengthValid = isCardNumeric = isCardLuhnValid = isExpiryDateValid = isCVVValid = false;
      }

      log("isCardValid end", 'I', this);

      return new PicardResponseMessage({
          success: success,
          resultCode: resultCode,
          errorMessage: errorMessage,
          result: {
            isValid:isValid,
            isCardLengthValid : isCardLengthValid,
            isCardNumeric     : isCardNumeric,
            isCardLuhnValid   : isCardLuhnValid,
            isExpiryDateValid : isExpiryDateValid,
            isCVVValid        : isCVVValid
          }
        });

    }

    //getCardType: (ASINCRONO) Obtiene el tipo de tarjeta.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber: numero de tarjeta
    // * callback: función  que se invocará con el resultado de la operación
    //
    //La función retorna un objeto con los siguientes campos:
    // * cardClass: Clase de la tarjeta (C/E): Particular o corporativa.
    // * creditDebit: Indica si la tarjeta es de crédito o débito (C/D).
    // * cardBrand: Marca de la tarjeta (VISA,...)
    // * cardType: Tipo de tarjeta propia (VISA HALCON/ECUADOR,...).
    this.getCardType = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber;

      try {

        log('getCardType start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.getCardType) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y se formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');

        //Validar número de tarjeta.
        res = this.isCardValid({cardNumber: cardNumber});
        if(res.success && !res.result.isValid) {
          if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
          if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
          if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
          if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
          if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
          throw new PicardException('CFL-00057', 'Card is invalid');
        }

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('getCardType end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.getCardType = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/cardtype',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'"}',
          selfCallback,
          this
        );
        activeProcess.getCardType = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('getCardType end','I', this);
        activeProcess.getCardType = false;
      }

    }

    //getCardTypeAirline: (ASINCRONO) Obtiene el tipo de tarjeta personalizado para compañias AirLine.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber: numero de tarjeta
    // * callback: función  que se invocará con el resultado de la operación
    //
    //La función retorna un objeto con los siguientes campos:
    // * cardClass: Clase de la tarjeta (C/E): Particular o corporativa.
    // * creditDebit: Indica si la tarjeta es de crédito o débito (C/D).
    // * cardType: Tipo de tarjeta propia (VISA HALCON/ECUADOR,...).
    this.getCardTypeAirline = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber;

      try {

        log('getCardTypeAirline start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.getCardTypeAirline) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');

        //Validar número de tarjeta.
        res = this.isCardValid({cardNumber: cardNumber});
        if(res.success && !res.result.isValid) {
          if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
          if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
          if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
          if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
          if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
          throw new PicardException('CFL-00057', 'Card is invalid');
        }

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('getCardTypeAirline end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.getCardTypeAirline = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/cardtypeairline',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'"}',
          selfCallback,
          this
        );
        activeProcess.getCardTypeAirline = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('getCardTypeAirline end','I', this);
        activeProcess.getCardTypeAirline = false;
      }

    }

    //createClientCard: (ASINCRONO) Registra una tarjeta cliente.
    //Esta funcionalidad tiene una dependencia con el token registrado ya que
    //todos los datos relacionados con el cliente estan registrado en el token.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber
    // * expiryDate
    // * cvv
    // * callback: función  que se invocará con el resultado de la operación
    this.createClientCard = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber, expiryDate, cvv;

      try {

        log('createClientCard start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.createClientCard) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');
        expiryDate = (data.expiryDate?data.expiryDate:'');
        cvv        = (data.cvv?data.cvv:'');

        //Validar número de tarjeta si nos lo especifican
        res = this.isCardValid({cardNumber: cardNumber, expiryDate: expiryDate, cvv: cvv});
        if(res.success && !res.result.isValid) {
          if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
          if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
          if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
          if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
          if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
          throw new PicardException('CFL-00057', 'Card is invalid');
        }

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('createClientCard end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.createClientCard = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/clientcards',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'","expirydate":"'+replaceAll('"','\\"',expiryDate)+'","cvv":"'+replaceAll('"','\\"',cvv)+'"}',
          selfCallback,
          this
        );
        activeProcess.createClientCard = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('createClientCard end','I', this);
        activeProcess.createClientCard = false;
      }

    }

    //deleteClientCard: (ASINCRONO) elimina una tarjeta cliente.
    //Esta funcionalidad tiene una dependencia con el token registrado ya que
    //todos los datos relacionados con el cliente estan registrado en el token.
    //El objeto de entrada tiene los siguientes campos:
    // * hashCard
    // * callback: función  que se invocará con el resultado de la operación
    this.deleteClientCard = function(data){

      var selfCallback, success, resultCode='', errorMessage='';

      try {

        log('deleteClientCard start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.deleteClientCard) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('deleteClientCard end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.deleteClientCard = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/clientcards',
          'DELETE',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","hashcard":"'+replaceAll('"','\\"',data.hashCard)+'"}',
          selfCallback,
          this
        );
        activeProcess.deleteClientCard = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('deleteClientCard end','I', this);
        activeProcess.deleteClientCard = false;
      }

    }

    //getClientCards: (ASINCRONO) Consulta de tarjetas de clientes almacenadas.
    //Esta funcionalidad tiene una dependecia con el token registrado ya que
    //tanto el codigo de cliente como el HashCard se toman de ahi para la consulta.
    //El objeto de entrada tiene los siguientes campos:
    // * callback: función  que se invocará con el resultado de la operación
    //
    //La función retorna un objeto con los siguientes campos:
    // * integrationCode
    // * customerCode
    // * customerName
    // * customerType
    // * manualCard
    // * Cards
    //   - cardNumber
    //   - aliasCard
    //   - cardHolder
    //   - expiryDate
    //   - hashCard
    //   - cardTypeAirline
    //   - creditDebitAirline
    //   - cardClassAirline
    //   - cardType
    //   - creditDebit
    //   - cardClass
    this.getClientCards = function(data){

      var selfCallback, success, resultCode='', errorMessage='';

      try {

        log('getClientCards start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.getClientCards) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('getClientCards end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.getClientCards = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/clientcards/'+this.TOKEN,
          'GET',
          '',
          selfCallback,
          this
        );
        activeProcess.getClientCards = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('getClientCards end','I', this);
        activeProcess.getClientCards = false;
      }

    }

    //getInstallment: (ASINCRONO) Consulta de plazos.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber: numero de tarjeta
    // * callback: función  que se invocará con el resultado de la operación
    //
    //La función retorna un objeto con los siguientes campos:
    // * installmentCode
    // * installmentName
    // * emvInstallmentCode
    this.getInstallment = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber;

      try {

        log('getInstallment start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.getInstallment) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');

        //Validar número de tarjeta.
        res = this.isCardValid({cardNumber: cardNumber});
        if(res.success && !res.result.isValid) {
          if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
          if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
          if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
          if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
          if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
          throw new PicardException('CFL-00057', 'Card is invalid');
        }

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('getInstallment end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.getInstallment = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/installment',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'"}',
          selfCallback,
          this
        );
        activeProcess.getInstallment = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('getInstallment end','I', this);
        activeProcess.getInstallment = false;
      }

    }

    //getScoringData: (ASINCRONO) Consulta los datos de scoring de la tarjeta.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber: numero de tarjeta
    // * callback: función  que se invocará con el resultado de la operación
    //
    //La función retorna un objeto con los siguientes campos:
    // * adenof
    // * adeudo
    // * issuingBank
    // * countryNumIpCode
    // * cardCode
    // * countryIpCode
    // * countryCardCode
    // * hashCard
    // * ofuscatedCard
    // * customerIp
    this.getScoringData = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber;

      try {

        log('getScoringData start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.getScoringData) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');

        //Validar número de tarjeta.
        res = this.isCardValid({cardNumber: cardNumber});
        if(res.success && !res.result.isValid) {
          if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
          if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
          if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
          if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
          if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
          throw new PicardException('CFL-00057', 'Card is invalid');
        }
        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('getScoringData end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.getScoringData = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/scoringdata',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'"}',
          selfCallback,
          this
        );
        activeProcess.getScoringData = true;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('getScoringData end','I', this);
        activeProcess.getScoringData = false;
      }

    }

    //doPayment: (ASINCRONO) Realizar un cobro. Esta función tiene dependencia
    //del token registrado cuando se intenta realizar un cobro de una tarjeta
    //cliente. El codigo de cliente se ha tenido que indicar en el token.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber
    // * expiryDate
    // * cvv
    // * hashCard
    // * installmentCode
    // * cardHolder
    // * callback: función  que se invocará con el resultado de la operación
    this.doPayment = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber,
        expiryDate, cvv, hashCard, installmentCode, cardHolder;

      try {

        log('doPayment start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado ya el cobro. Evita llamadas multiples.
        if (activeProcess.doPayment) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');
        expiryDate = (data.expiryDate?data.expiryDate:'');
        cvv        = (data.cvv?data.cvv:'');
        hashCard   = (data.hashCard?data.hashCard:'');
        installmentCode = (data.installmentCode?data.installmentCode:'');
        cardHolder = (data.cardHolder?data.cardHolder:'');

        //Validar que no se haya especificado el hashCard y datos de tarjetas (UNO U OTRO)
        if(hashCard && (cardNumber || expiryDate || cvv))
          throw new PicardException('CFL-00757', 'You can not specify data card and a hash card');

        //Validar número de tarjeta si nos lo especifican
        if(cardNumber || expiryDate || cvv) {
          res = this.isCardValid({cardNumber: cardNumber, expiryDate: expiryDate, cvv: cvv});
          if(res.success && !res.result.isValid) {
            if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
            if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
            if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
            if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
            if(!res.result.isCVVValid) log('isCardLengthValid invalid', 'E', this);
            throw new PicardException('CFL-00057', 'Card is invalid');
          }
        }

        //Validar hashCard
        if(hashCard && hashCard.length != 32) throw new PicardException('CFL-00603', 'Hash Identificador is invalid');

        //Validar plazos
        if(installmentCode && (installmentCode.length != 3 || isNaN(installmentCode)))
          throw new PicardException('CFL-00637', 'Installment code is invalid');

        //Validar titular de la tarjeta
        if(cardHolder && cardHolder.length > 80) throw new PicardException('CFL-00744', 'Card Holder is invalid');

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            activeProcess.getTicket = callbackData.success;
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('doPayment end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.doPayment = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/dopayment',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'","cvv":"'+replaceAll('"','\\"',cvv)+'","expirydate":"'+replaceAll('"','\\"',expiryDate)+'","hashcard":"'+replaceAll('"','\\"',hashCard)+'","installmentcode":"'+replaceAll('"','\\"',installmentCode)+'","cardholder":"'+replaceAll('"','\\"',cardHolder)+'"}',
          selfCallback,
          this
        );
        activeProcess.doPayment = true;
        activeProcess.getTicket = false;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('doPayment end','I', this);
        activeProcess.getTicket = activeProcess.doPayment = false;
      }

    }

    //doRefund: (ASINCRONO) Realizar una devolución. Esta función tiene dependencia
    //del token registrado cuando se intenta realizar una devolución de una tarjeta
    //cliente. El codigo de cliente se ha tenido que indicar en el token.
    //El objeto de entrada tiene los siguientes campos:
    // * cardNumber
    // * expiryDate
    // * hashCard
    // * comments
    // * callback: función  que se invocará con el resultado de la operación
    this.doRefund = function(data){

      var selfCallback, res, success, resultCode='', errorMessage='', cardNumber,
        expiryDate, hashCard, comments;

      try {

        log('doRefund start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        if (!data || typeof(data) != 'object') throw new PicardException('CFL-00769', 'The input parameter is invalid.');

        //Validar la función de callback
        if(typeof(data.callback) != 'function') throw new PicardException('CFL-00771', 'The callback function is mandatory.');

        //Verifica que no se haya lanzado. Evita llamadas multiples.
        if (activeProcess.doRefund) throw new PicardException('CFL-00783', 'Process has already been launched.');

        //Leer los parametros de entrada y formatear
        cardNumber = (data.cardNumber?data.cardNumber:'');
        expiryDate = (data.expiryDate?data.expiryDate:'');
        hashCard   = (data.hashCard?data.hashCard:'');
        comments   = (data.comments?data.comments:'');

        //Validar que no se haya especificado el hashCard y datos de tarjetas (UNO U OTRO)
        if(hashCard && (cardNumber || expiryDate))
          throw new PicardException('CFL-00757', 'You can not specify data card and a hashCard');

        //Validar número de tarjeta si nos lo especifican
        if(cardNumber || expiryDate) {
          if(cardNumber != '@nocard@') {
            res = this.isCardValid({cardNumber: cardNumber, expiryDate: expiryDate});
            if(res.success && !res.result.isValid) {
              if(!res.result.isCardLengthValid) log('CardLength invalid', 'E', this);
              if(!res.result.isCardNumeric) log('CardNumeric invalid', 'E', this);
              if(!res.result.isCardLuhnValid) log('CardLuhn invalid', 'E', this);
              if(!res.result.isExpiryDateValid) log('ExpiryDateValid invalid', 'E', this);
              throw new PicardException('CFL-00057', 'Card is invalid');
            }
          }
        }

        //Validar hashCard
        if(hashCard && hashCard.length != 32) throw new PicardException('CFL-00603', 'Hash Identificador is invalid');

        //Validar comentarios
        if(comments && comments.length > 1000) throw new PicardException('CFL-00756', 'Comments is invalid');

        //Definir el precallback nuestro, lo que hará antes de llamar al callback del cliente
        selfCallback = function(callbackData, parent){
          try {
            log(callbackData,'I', parent);
            activeProcess.getTicket = callbackData.success;
            if(typeof(data.callback) == 'function')
              data.callback(new PicardResponseMessage({
                success      : callbackData.success,
                resultCode   : callbackData.resultCode,
                errorMessage : callbackData.errorMessage,
                result       : callbackData.result
              }));
            log('doRefund end','I', this);
          }
          catch(e) {
            log(e.message, 'E', this);
          }
          activeProcess.doRefund = false;
        }

        //Realizar peticion al servicio API Widget
        sendMessage(
          this.HOST_ENVIRONMENT+'/rest/api/dorefund',
          'POST',
          '{"token":"'+replaceAll('"','\\"',this.TOKEN)+'","cardnumber":"'+replaceAll('"','\\"',cardNumber)+'","expirydate":"'+replaceAll('"','\\"',expiryDate)+'","hashcard":"'+replaceAll('"','\\"',hashCard)+'","comments":"'+replaceAll('"','\\"',comments)+'"}',
          selfCallback,
          this
        );
        activeProcess.doRefund = true;
        activeProcess.getTicket = false;

      }
      catch(e) {
        success = false;
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        if(typeof(data.callback) == 'function')
          data.callback(new PicardResponseMessage({
            success      : success,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : {}
          }));
        log('doRefund end','I', this);
        activeProcess.getTicket = activeProcess.doRefund = false;
      }

    }

    //isCardValid: (SINCRONO) Obtiene la ruta para obtener el ticket en formato PDF.
    this.getTicket = function(){

      var result, resultCode='', errorMessage='';

      try {

        log('getTicket start', 'I', this);

        log(data, 'I', this);

        //Valida si el componente se ha inicializado correctamente antes de
        //lanzar esta operación
        if (!isReady()) throw new PicardException('CFL-00770', 'PicardWidget not been correctly initialized.');

        //Valida si se ha realizado una operacion de cobro o devolucion antes
        //de ejecutar este método
        if (!activeProcess.getTicket) throw new PicardException('CFL-00784', 'There has been no operation.');

        result = new PicardResponseMessage({
            success      : true,
            resultCode   : '',
            errorMessage : '',
            result       : this.HOST_ENVIRONMENT+'/rest/api/ticket/'+this.TOKEN
          });

      }
      catch(e) {
        resultCode = (e.resultCode?e.resultCode:'CFL-00007');
        errorMessage = (e.errorMessage?e.errorMessage:e.message);
        log(resultCode+': '+errorMessage, 'E', this);
        result = new PicardResponseMessage({
            success      : false,
            resultCode   : resultCode,
            errorMessage : errorMessage,
            result       : null
          });
      }

      log('getTicket end','I', this);

      return result;

    }

    //MÉTODOS PRIVADOS

    //Metodo de consulta si el componente picardWidget se ha iniciado correctamente
    var isReady = function() {
      return ready;
    }

    //Metodo que reemplaza caracteres
    var replaceAll = function (find, replace, str) {
      return str.replace(new RegExp(find, 'g'), replace);
    }

    //Este método sirve para hacer las llamadas al backend
    var sendMessage = function(url, method, params, callback, parent) {
      //TO-DO dentro de un método privado no funcionan los this. hace falta enviar todos los parámetros necesarios, entre ellos del debug
      log('start sendMessage('+url+', '+method+', '+params+')', 'I', parent);

      //TO-DO recoger los logs hasta el momento y enviarlos al servidor a la vez que la llamada

      //Validaciones
      //TO-DO mejorar validaciones y que escale el error, posiblemente definiendo bien el onError de abajo
      if (!url || !method){
        log('error sendMessage, all values are mandatory', 'E', parent);
        return;
      }

      //Configuramos el envío http en función del navagedor
      var xhr = new XMLHttpRequest();
      if ("withCredentials" in xhr) {
        // Principales navegadores.
        xhr.open(method, url, true);
        
        xhr.setRequestHeader("Accept","text/plain");
        xhr.setRequestHeader("Content-Type","text/plain");
      } else if (typeof XDomainRequest != "undefined") {
        // IE8 y IE9
        xhr = new XDomainRequest();
        xhr.open(method, url);
      } else {
        // CORS no soportado
        log('Connection error: This browser is not supported','E', parent);
        xhr = null;
        throw new PicardException('CFL-00007','This browser is not supported.');
      }

      //Configuramos el callback si ha fallado. Se define en una función aparte para poder llamarla desde el onload, porque IE8 no admite llamar directamente a xhr.onerror()
      var onError = function() {
        log("Error in http connection to Picard Web Server - xhr.status = " + xhr.status,'E', parent);
        callback(new PicardResponseMessage({success:false,resultCode:'CFL-00007',errorMessage:'Error ('+xhr.status + ' - '+xhr.statusText+') in http connection',result:null}), parent);
      };
      xhr.onerror = onError;

      //Configuramos el callback si ha ido bien
      xhr.onload = function() {
        //El status no funciona en IE, pero llega por onError directamente así que no hace falta contemplarlo
        if (xhr.status == 200 || !xhr.status)
          callback(new Function('return '+xhr.responseText)(), parent);
        else
          onError();
      };


      //Envío de la petición
      xhr.send(params);

      log("sendMessage end",'I', parent);
    };

    //Método para validar el digito Luhn
    var validateLuhn = (function(){
      var luhnArr = [0, 2, 4, 6, 8, 1, 3, 5, 7, 9];
      return function(str) {
        var counter = 0;
        var incNum;
        var odd = false;
        var temp = String(str).replace(/[^\d]/g, "");
        if ( temp.length == 0)
          return false;
        for (var i = temp.length-1; i >= 0; --i) {
          incNum = parseInt(temp.charAt(i), 10);
          counter += (odd = !odd)? incNum : luhnArr[incNum];
        }
        return (counter%10 == 0);
      }
    })();

    log("PicardWidget initialized successfully",'I');

  }
  catch(e) {
    log(e.message, 'E', this);
    log('PicardWidget initialized successfully','I');
    isReady = false;
  }

}

//Tipo de datos de mensajes de respuesta
function PicardResponseMessage (data){
  //TO-DO añadir más información para otros tipos de respuestas
  //success = La petición ha tenido éxito? true o false
  this.success = data.success;
  //resultCode = Código de resultado de la petición. 000 Si es correcto
  this.resultCode = data.resultCode;
  //errorMessage = Mensaje si hace falta especificar un error o cualquier cosa
  this.errorMessage = data.errorMessage;
  //result = Datos del resultado de la petición. Null si es un error
  this.result = data.result;
}

//Tipo de datos para excepciones
function PicardException(resultCode, errorMessage){
  this.resultCode = resultCode;
  this.errorMessage = errorMessage;
}