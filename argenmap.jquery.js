/*
 *  Argenmap Plugin para JQuery 
 *  Version   : 1.4
 *  Date      : 2013-07-19
 *  Licence   : GPL v3 : http://www.gnu.org/licenses/gpl.html  
 *  Author    : Oscar López
 *  Contact   : olopez@ign.gob.ar
 *  Web site  : http://ign.gob.ar/argenmap
 *   
 *  Copyright (c) 2012 Instituto Geográfico Nacional de la República Argentina
 *  Todos los derechos reservados.
 *
 */

(function ($) {
  var IGN_CACHES = [
    'http://cg.aws.af.cm/tms',
    'http://190.220.8.216/tms',
    'http://mapaabierto.aws.af.cm/tms',
    'http://igntiles1.ap01.aws.af.cm/tms'
  ];

  //Espacio de nombres para algunas funciones
  var argenmap = {};

  argenmap.BASEURL = 'http://www.ign.gob.ar/argenmap/argenmap.jquery/';

  /** 
   * Constant: URL_HASH_FACTOR
   * {Float} Used to hash URL param strings for multi-WMS server selection.
   *         Set to the Golden Ratio per Knuth's recommendation.
   */
  var URL_HASH_FACTOR = (Math.sqrt(5) - 1) / 2;

  /**
   * Method: selectUrl
   * selectUrl() implements the standard floating-point multiplicative
   *     hash function described by Knuth, and hashes the contents of the 
   *     given param string into a float between 0 and 1. This float is then
   *     scaled to the size of the provided urls array, and used to select
   *     a URL.
   *
   * Parameters:
   * paramString - {String}
   * urls - {Array(String)}
   * 
   * Returns:
   * {String} An entry from the urls array, deterministically selected based
   *          on the paramString.
   */
  function selectURL(paramString, urls) {
    var product = 1,
      i,
      len;
    len = paramString.length;
    for (i = 0, len; i < len; i++) {
      product *= paramString.charCodeAt(i) * URL_HASH_FACTOR;
      product -= Math.floor(product);
    }
    return urls[Math.floor(product * urls.length)];
  }

  /***************************************************************************/
  /*                           GLOBALS de Argenmap                                 */
  /***************************************************************************/

  var _defaults = {
    unit: 'km',
    zoom: 5,
    mapTypeControl: true,

    center: {
      lat: -34,
      lng: -59
    }
  };


  /***************************************************************************/
  /*                                Argenmap                                    */
  /***************************************************************************/

  function Argenmap(element, opciones) {

    var map = null;
    this.element = element;
    this.$el = $(element);

    this.opts = $.extend({}, _defaults, opciones);
    this.gmap = null;
    this._marcadores = {};
    this._dragging = false;

    //-----------------------------------------------------------------------//
    // funciones de Argenmap
    //-----------------------------------------------------------------------//

    /**
     * Initialize google.maps.Map object
     **/
    this.init = function () {
      var _this = this;
      
      _this.opts.center = new google.maps.LatLng(_this.opts.center.lat, _this.opts.center.lng);
        //Kludge pa que no muestre el tipito de streetView
      _this.opts.streetViewControl = false;
        //Kludge pa que muestre escala gráfica
        // Las escalas cartográficas en la web son BS!
        // http://www.youtube.com/watch?v=c4psKYpfnYs
      _this.opts.scaleControl = true;
        //Preparo el div para que chapee el IGN
        // El div q aloja el mapa está rodeado
        // por un header y un footer
      _this.opts.mapTypeControlOptions = {
        style:google.maps.MapTypeControlStyle.DROPDOWN_MENU
      };
      var mapCanvas = argenmap._prepararContenedor(this.$el);
      
      this.gmap = map = new google.maps.Map(mapCanvas, _this.opts);
      
      _this.mapearEventosDelMapa();
      
      this.$el.data('gmap', map);

        //Agrego la capa base del IGN a los tipos de mapas
        //Esto es para que se cargue la capa de topónimos IGN
        //sobre satellite
      google.maps.event.addListener(map, "maptypeid_changed", function () {
        map.setZoom(map.getZoom() + 1);
        map.setZoom(map.getZoom() - 1);
      });
      argenmap.GmapAgregarCapaBase(map, new argenmap.CapaBaseArgenmap());
      argenmap.GmapAgregarCapa(map, new argenmap.CapaTMSArgenmap());
      this.gmap.setMapTypeId('Mapa IGN');
      return true;
    };

    /*
     * Mapa eventos del objeto google.maps.Map 
     * a eventos de del objeto Jquery con .trigger()
     */
    this.mapearEventosDelMapa = function()
    {
      var _this = this;
      google.maps.event.addListener(_this.gmap, "zoom_changed", function (e) {
        _this.$el.trigger('zoomend', _this.gmap.getZoom());
        _this.$el.trigger('moveend', [_this.gmap.getZoom(), _this.$el.centro()]);
      });
      google.maps.event.addListener(_this.gmap, "dragstart", function (e) {
        _this._dragging = true;
      });      
      google.maps.event.addListener(_this.gmap, "dragend", function (e) {
        _this._dragging = false;
        _this.$el.trigger('moveend', [_this.gmap.getZoom(), _this.$el.centro()]);
      });      
      google.maps.event.addListener(_this.gmap, "center_changed", function (e) {
        if (! _this._dragging) {
          _this.$el.trigger('moveend', [_this.gmap.getZoom(), _this.$el.centro()]);
        }
      });            
    };

    this.agregarCapaKML = function (opciones) {
      var _this = this,
        defaults = {
          preserveViewport: true,
          map: _this.$el.data('gmap')
        };
      opciones = $.extend(defaults, opciones);
      var kml = new google.maps.KmlLayer(opciones);
    };

    this.infoWindow = function () {
      if (this._infoWindow === undefined) {
        this._infoWindow = new google.maps.InfoWindow();
      }
      return this._infoWindow;
    };

    this.agregarMarcador = function (opciones) {
      var _this = this,
        defaults = {
          lat: _this.gmap.getCenter().lat(),
          lng: _this.gmap.getCenter().lng(),
          icono: argenmap.BASEURL + 'img/marcadores/punto.png',
          nombre: 'Marcador_' + Math.floor(Math.random() * 10100),
          contenido: undefined
        };
      opciones = $.extend({}, defaults, opciones);


      //compatibilidad entre lng, lon y long
      if(opciones.hasOwnProperty("long")) {
        //long es un reserved de JS, closure no puede manejarlo
        opciones.lng = opciones['long'];
      }else if(opciones.hasOwnProperty("lon")) {
        opciones.lng = opciones.lon;
      }else if(opciones.hasOwnProperty("lat") && typeof(opciones.lat) === "function"){
        //el argument es un google.maps.LatLng
        opciones.lat = opciones.lat();
        opciones.lng = opciones.lng();
      }

      var marker = {};
      marker.icon = opciones.icono;
      marker.data = opciones.contenido;
      marker.position = new google.maps.LatLng(opciones.lat, opciones.lng);
      marker.title = opciones.nombre;
      marker.map = _this.gmap;

      var m = new google.maps.Marker(marker);

      this._marcadores[opciones.nombre] = m;

      google.maps.event.addListener(m, 'click', function () {
        if (!opciones.contenido) {
          return;
        }
        _this.infoWindow().open(_this.$el.data('gmap'), m);
        _this.infoWindow().setContent(opciones.contenido);
      });

      return;
    };

    /**
     * Quita un marcador del mapa basado en el nombre
     **/
    this.quitarMarcador = function (nombre) {
      if (this._marcadores[nombre] !== undefined) {
        this._marcadores[nombre].setMap(null);
        delete this._marcadores[nombre];
      }
    };

    /**
     * Modifica un marcador basado en el nombre
     * Las opciones son las mismas que al momento de crear un marcador
     **/
    this.modificarMarcador = function (nombre, opciones) {
      if (this._marcadores[nombre] === undefined) {
        return;
      }
      var m = this._marcadores[nombre];

      this.quitarMarcador(nombre);
      opciones = $.extend(m, opciones);
      //para evitar comportamiento raro
      // si se pasa nombre en opciones.
      opciones.nombre = nombre;
      this.agregarMarcador(opciones);
    };

    this.encuadrar = function( extent ) {
      var _this = this,
        s = extent.sur;
        w = extent.oeste;
        n = extent.norte;
        e = extent.este;
        southwest = new google.maps.LatLng(s,w),
        northeast = new google.maps.LatLng(n,w),
        boundingbox = new google.maps.LatLngBounds(southwest, northeast);
        _this.gmap.fitBounds( boundingbox);
    };    

    this.geocodificar = function ( str, callback ) {
      var _this = this;

      $.getJSON('http://nominatim.openstreetmap.org/search?format=json&limit=5&q=' + str, function(data) {
        if (data.length ) {
          callback( data );
        }
        
        console.log(data);
      }, _this);

    };

  }
  /* COMPATIBILIDAD CON IE < 9; implementacion de indexOf para arrays */
  if (!Array.prototype.indexOf)
  {
    Array.prototype.indexOf = function(elt /*, from*/)
    {
      var len = this.length >>> 0;

      var from = Number(arguments[1]) || 0;
      from = (from < 0)
           ? Math.ceil(from)
           : Math.floor(from);
      if (from < 0)
        from += len;

      for (; from < len; from++)
      {
        if (from in this &&
            this[from] === elt)
          return from;
      }
      return -1;
    };
  }

  /**
   * Clase de cache interna de urls
   */
  argenmap.cacheDeCliente = function () {
    this.MAX_TILES = 150;
    this.cache = [];
    this.cacheRef = {};
  };

  /**
   * Metodos de cache interna
   */
  argenmap.cacheDeCliente.prototype = {
    /**
     * Recupera un tile de la cache.
     * Si no existe, devuelve false
     */
    recuperar: function(x, y, z)
    {
      var tilecode = x + '-' + y + '-' + z;

      if(this.cache.indexOf(tilecode) !== -1) 
      {
        return this.cacheRef[tilecode];
      }

      return false;
    },
    /**
     * Guarda una entrada en la cache interna
     * Si detecta baseURL como un string, anula el proceso,
     * no hace falta cachear si es un solo servidor de tiles
     */
    guardar: function(x, y, z, url)
    {
      if (typeof this.baseURL === 'string') {
        //si no tengo cache servers esto no sirve y no guardo nada
        return;
      }
      var tilecode = x + '-' + y + '-' + z;
      this.cache.push(tilecode);
      this.cacheRef[tilecode] = url;
      var sale;
      if(this.cache.length > this.MAX_TILES)
      {
         sale = this.cache.shift();
         delete this.cacheRef[sale];
      }
    }
  };

  /**
   * @class Representa una capa WMS opaca que puede ser utilizada como capa base de los mapas
   * @constructor
   * @param {Object} opts opciones para construir la capa
   * @export
   */
  argenmap.CapaBaseWMS = function (opts) {

    /**
     * El objeto ImageMapType q representa a esta capa en para la api de gmaps.
     * @public 
     * @type google.maps.ImageMapType
     */
    this.imageMapType = null;
    /**
     * Referencia al objeto map de google sobre el cual está capa está desplegada.
     * Se setea con argenmap.agregarCapaBaseWMS().
     * @public 
     * @type google.maps.Map
     */
    this.gmap = null;
    /**
     * Un identificador de texto para esta capa. Este identificador
     * es el que se mostrará en los selectores de capas del mapa.
     * @public
     * @default "Capa base WMS"
     * @type google.maps.Map
     */
    this.name = "Capa base WMS";

    this.tipo = 'wms-1.1.1';

    jQuery.extend(this, opts);
    //Creating the WMS layer options.  This code creates the Google imagemaptype options for each wms layer.  In the options the function that calls the individual 
    //wms layer is set 


    var wmsOptions = {
      alt: this.name,
      getTileUrl: jQuery.proxy(this.getTileUrl, this),
      isPng: true,
      maxZoom: 17,
      minZoom: 3,
      name: this.name,
      tileSize: new google.maps.Size(256, 256)

    };


    //Creating the object to create the ImageMapType that will call the WMS Layer Options.

    this.imageMapType = new google.maps.ImageMapType(wmsOptions);
  };




  /**
   * Devuelve la url para conseguir una tile de google maps equivalente
   * en el servidor WMS
   * @param {google.maps.MapTile} tile La tile de GMap que se necesita emular en el servidor WMS
   * @param {Number} zoom El nivel de zoom actual. Utilizado para los cálculos de resoluciones
   */
  argenmap.CapaBaseWMS.prototype.getTileUrl = function (tile, zoom) {
    var projection = this.gmap.getProjection();
    var zpow = Math.pow(2, zoom);
    var ul = new google.maps.Point(tile.x * 256.0 / zpow, (tile.y + 1) * 256.0 / zpow);
    var lr = new google.maps.Point((tile.x + 1) * 256.0 / zpow, (tile.y) * 256.0 / zpow);

    var ulw = projection.fromPointToLatLng(ul);

    var lrw = projection.fromPointToLatLng(lr);
    //The user will enter the address to the public WMS layer here.  The data must be in WGS84
    var baseURL = this.baseURL;
    var version = "1.1.1";
    var request = "GetMap";
    var format = "image%2Fpng"; //type of image returned  or image/jpeg
    //The layer ID.  Can be found when using the layers properties tool in ArcMap or from the WMS settings 
    var layers = this.layers;
    //projection to display. This is the projection of google map. Don't change unless you know what you are doing.  
    //Different from other WMS servers that the projection information is called by crs, instead of srs


    //usando mercator para pedir 3857
    ulw = argenmap.latLngAMercator(ulw.lat(), ulw.lng());
    lrw = argenmap.latLngAMercator(lrw.lat(), lrw.lng());

    var crs = "EPSG:3857";
    var bbox = ulw.lng + "," + ulw.lat + "," + lrw.lng + "," + lrw.lat;

    var service = "WMS";
    //the size of the tile, must be 256x256
    var width = "256";
    var height = "256";
    //Some WMS come with named styles.  The user can set to default.
    var styles = "";
    //Establish the baseURL.  Several elements, including &EXCEPTIONS=INIMAGE and &Service are unique to openLayers addresses.

    var url = baseURL + "LAYERS=" + layers + '&TRANSPARENT=FALSE' + "&VERSION=" + version + "&SERVICE=" + service + "&REQUEST=" + request + "&STYLES=" + styles + "&FORMAT=" + format + "&SRS=" + crs + "&BBOX=" + bbox + "&WIDTH=" + width + "&HEIGHT=" + height;
    return url;
  };


  /**
   * @class Representa una capa TMS opaca que puede ser utilizada como capa base de los mapas
   * @constructor
   * @param {Object} opts opciones para construir la capa
   * @export
   */
  argenmap.CapaBaseTMS = function (opts) {
    /**
     * Mantiene cache de tiles requeridas para no volver a pedir a distintos
     * servidores del array
     */
    this.cache = new argenmap.cacheDeCliente();
    /**
     * El objeto ImageMapType q representa a esta capa en para la api de gmaps.
     * @public 
     * @type google.maps.ImageMapType
     */
    this.imageMapType = null;
    /**
     * Referencia al objeto map de google sobre el cual está capa está desplegada.
     * Se setea con argenmap.agregarCapaBaseWMS().
     * @public 
     * @type google.maps.Map
     */
    this.gmap = null;
    /**
     * Un identificador de texto para esta capa. Este identificador
     * es el que se mostrará en los selectores de capas del mapa.
     * @public
     * @default "Capa base WMS"
     * @type google.maps.Map
     */
    this.name = "Capa base TMS";

    this.tipo = 'tms-1.0.0';

    jQuery.extend(this, opts);
    //Creating the WMS layer options.  This code creates the Google imagemaptype options for each wms layer.  In the options the function that calls the individual 
    //wms layer is set 


    var tmsOptions = {
      alt: this.name,
      getTileUrl: jQuery.proxy(this.getTileUrl, this),
      isPng: true,
      maxZoom: 17,
      minZoom: 3,
      name: this.name,
      tileSize: new google.maps.Size(256, 256)

    };


    //Creating the object to create the ImageMapType that will call the WMS Layer Options.

    this.imageMapType = new google.maps.ImageMapType(tmsOptions);
  };

  /**
   * Devuelve la url para conseguir una tile de google maps equivalente
   * en el servidor TMS
   * @param {google.maps.MapTile} tile La tile de GMap que se necesita emular en el servidor WMS
   * @param {Number} zoom El nivel de zoom actual. Utilizado para los cálculos de resoluciones
   */
  argenmap.CapaBaseTMS.prototype.getTileUrl = function (tile, zoom) {

    var baseURL = this.baseURL;
    if (typeof baseURL !== 'string') {
      baseURL = selectURL(tile.x + '' + tile.y, baseURL);
      var cached = this.cache.recuperar(tile.x,tile.y,zoom);
      if(cached)
      {
        return cached;
      }
    }
    var layers = this.layers;
    /*
     * Dark magic. Convierto la y de google a una y de TMS
     * http://alastaira.wordpress.com/2011/07/06/converting-tms-tile-coordinates-to-googlebingosm-tile-coordinates/
     */
    var ytms = (1 << zoom) - tile.y - 1;
    var url = baseURL + "/" + layers + "/" + zoom + "/" + tile.x + '/' + ytms + ".png";
    this.cache.guardar(tile.x,tile.y,zoom,url);
    return url;
  };


  argenmap.CapaWMS = function (opts) {
    // El objeto ImageMapType q representa a esta capa en para la api de gmaps.
    this.imageMapType = null;
    // Referencia al objeto map de google. Se setea con argenmap.agregarCapaWMS
    this.gmap = null;

    this.tipo = 'wms-1.1.1';

    this.name = 'CAPA WMS';
    this.alt = 'CAPA WMS';
    jQuery.extend(this, opts);
    //Creating the WMS layer options.  This code creates the Google imagemaptype options for each wms layer.  In the options the function that calls the individual 
    //wms layer is set 


    var wmsOptions = {
      alt: this.alt,
      getTileUrl: jQuery.proxy(this.getTileUrl, this),
      isPng: false,
      maxZoom: 17,
      minZoom: 6,
      name: this.name,
      tileSize: new google.maps.Size(256, 256)
    };

    //Creating the object to create the ImageMapType that will call the WMS Layer Options.

    this.imageMapType = new google.maps.ImageMapType(wmsOptions);

  };

  argenmap.CapaWMS.prototype.getTileUrl = function (tile, zoom) {



    var projection = this.gmap.getProjection();
    var zpow = Math.pow(2, zoom);

    var ul = new google.maps.Point(tile.x * 256.0 / zpow, (tile.y + 1) * 256.0 / zpow);
    var lr = new google.maps.Point((tile.x + 1) * 256.0 / zpow, (tile.y) * 256.0 / zpow);
    var ulw = projection.fromPointToLatLng(ul);
    var lrw = projection.fromPointToLatLng(lr);
    //The user will enter the address to the public WMS layer here.  The data must be in WGS84
    var baseURL = this.baseURL;
    var version = "1.1.1";
    var request = "GetMap";
    var format = "image/png"; //type of image returned 
    var layers = this.layers;

    //usando mercator para pedir 900913
    ulw = argenmap.latLngAMercator(ulw.lat(), ulw.lng());
    lrw = argenmap.latLngAMercator(lrw.lat(), lrw.lng());

    var crs = "EPSG:3857";
    var bbox = ulw.lng + "," + ulw.lat + "," + lrw.lng + "," + lrw.lat;

    var width = "256";
    var height = "256";

    var styles = "";

    var url = baseURL + "VERSION=" + version + "&SERVICE=WMS" + "&REQUEST=" + request + "&LAYERS=" + layers + "&STYLES=" + styles + "&SRS=" + crs + "&BBOX=" + bbox + "&WIDTH=" + width + "&HEIGHT=" + height + "&FORMAT=" + format + "&TRANSPARENT=TRUE";
    return url;
  };

  argenmap.CapaTMS = function (opts) {
    /**
     * Mantiene cache de tiles requeridas para no volver a pedir a distintos
     * servidores del array
     */
    this.cache = new argenmap.cacheDeCliente();
    // El objeto ImageMapType q representa a esta capa en para la api de gmaps.
    this.imageMapType = null;
    // Referencia al objeto map de google. Se setea con argenmap.agregarCapaWMS
    this.gmap = null;

    this.tipo = 'tms-1.0.0';

    this.name = 'CAPA TMS';
    this.alt = 'CAPA TMS';
    jQuery.extend(this, opts);
    //Creating the TMS layer options.  This code creates the Google imagemaptype options for each wms layer.  In the options the function that calls the individual 
    //wms layer is set 


    var tmsOptions = {
      alt: this.alt,
      getTileUrl: jQuery.proxy(this.getTileUrl, this),
      isPng: false,
      maxZoom: 17,
      minZoom: 6,
      name: this.name,
      tileSize: new google.maps.Size(256, 256)
    };

    //Creating the object to create the ImageMapType that will call the TMS Layer Options.

    this.imageMapType = new google.maps.ImageMapType(tmsOptions);

  };

  argenmap.CapaTMS.prototype.getTileUrl = function (tile, zoom) {

    var baseURL = this.baseURL;
    if (typeof baseURL !== 'string') {
      baseURL = selectURL(tile.x + '' + tile.y, baseURL);
      var cached = this.cache.recuperar(tile.x,tile.y,zoom);
      if(cached)
      {
        return cached;
      }
    }
    var layers = this.layers;
    /*
     * Dark magic. Convierto la y de google a una y de TMS
     * http://alastaira.wordpress.com/2011/07/06/converting-tms-tile-coordinates-to-googlebingosm-tile-coordinates/
     */
    var ytms = (1 << zoom) - tile.y - 1;
    var url = baseURL + "/" + layers + "/" + zoom + "/" + tile.x + '/' + ytms + ".png";
    this.cache.guardar(tile.x,tile.y,zoom,url);
    return url;
  };

  argenmap.CapaBaseArgenmap = function () {
    var opts = {
      name: 'Mapa IGN',
      baseURL: IGN_CACHES,
      layers: 'capabaseargenmap'
    };
    argenmap.CapaBaseTMS.apply(this, [opts]);
  };

  argenmap.CapaBaseArgenmap.prototype.getTileUrl = function () {
    return argenmap.CapaBaseTMS.prototype.getTileUrl.apply(this, arguments);
  };

  argenmap.CapaTMSArgenmap = function () {
    var opts = {
      name: 'IGN',
      baseURL: IGN_CACHES,
      layers: 'capabasesigign'
    };
    argenmap.CapaTMS.apply(this, [opts]);
  };
  argenmap.CapaTMSArgenmap.prototype.getTileUrl = function (a, b) {
    // Solo cargo tiles para este overlay
    // si estoy en la capa satelite
    if (this.gmap.getMapTypeId() !== 'satellite') {
      return false;
    }
    return argenmap.CapaTMS.prototype.getTileUrl.apply(this, arguments);

  };
  argenmap.GmapAgregarCapaBase = function (gmap, capa) {
    var mapTypeIds;

    capa.gmap = gmap;

    // Agrego la capa base como un nuevo "tipo de mapa" a al gmap;
    gmap.mapTypes.set(capa.imageMapType.name, capa.imageMapType);



    if (gmap.mapTypeControlOptions) {
      mapTypeIds = gmap.mapTypeControlOptions.mapTypeIds;
      if (mapTypeIds) {
        mapTypeIds.splice(0, 0, capa.imageMapType.name);
      } else {
        mapTypeIds = [capa.imageMapType.name, 'satellite'];
      }
    } else {
      mapTypeIds = [capa.imageMapType.name, 'satellite'];
    }


    gmap.setOptions({
      mapTypeControlOptions: {
        mapTypeIds: mapTypeIds,
        style: google.maps.MapTypeControlStyle.DROPDOWN_MENU
      }
    });

  };

  /**
   * Superpone una capa WMS sobre las capas base y las demás capas ya superpuestas
   *
   * @param {Object} capa La capa a superponer sobre al mapa.
   */
  argenmap.GmapAgregarCapa = function (gmap, capa) {

    capa.gmap = gmap;
    //gmap.overlayMapTypes.insertAt(0, capa.imageMapType);
    gmap.overlayMapTypes.push(capa.imageMapType);

  };

  /**
   * Prepara un div contenedor del mapa. Configura el encabezado
   * y el footer del mapa en donde se muestran el logo y la leyenda
   * de autor ía de los datos.
   * @param {string} divId el id del div contenedor.
   * @private 
   */
  argenmap._prepararContenedor = function (div) {
    var LOGOURL = argenmap.BASEURL + 'img/logoignsintexto-25px.png';
    var mapCanvas_ = $('<div class="argenmapMapCanvas" />').css({
      'width': '100%',
      'min-height': '200px'
    });

    var mapFooter_ = $('<div class="argenmapMapFooter" />').css({
      'font-family': 'Arial',
      'background-color': '#1C74A5',
      'box-shadow': '0 0 11px rgb(5, 66, 100) inset',
      'font-size': '10px',
      'text-align': 'right',
      'height': '20px',
      'vertical-align': 'middle',
      'color': 'white',
      'min-height': '15px',
      'line-height': '15px',
      'padding': '5px 5px',
      'margin':0,
      'border':0
    });
    var mapLogo_ = $('<img />').css({
    	'height':'20px'
    });
    var mapLogoAnchor_ = $('<a style="float:left" target="_blank" href="http://www.ign.gob.ar/argenmap/argenmap.jquery/docs"></a>').append(
      mapLogo_);
    var $contenedor_ = div;

    mapLogo_.attr('src', LOGOURL).css({
      'border': '0'
    });
    $contenedor_.append(mapCanvas_);
    $contenedor_.append(mapFooter_);
    mapFooter_.append(mapLogoAnchor_);
    mapFooter_.append('<a style="color:white;text-decoration:underline;font-weight:normal" target="_blank" href="http://www.ign.gob.ar/argenmap/argenmap.jquery/docs/#datosvectoriales">Top&oacute;nimos, datos topogr&aacute;ficos - IGN Argentina // Calles - OpenStreetMap</a>');

    argenmap._maximizarCanvas($contenedor_, mapFooter_, mapCanvas_);
    return mapCanvas_.get(0);
  };

  /*
   * Cambia el tamaño del canvas del mapa de acuerdo al alto del contenedor
   * y setea el listener para cuando resizeo el div
   */
  argenmap._maximizarCanvas = function (contenedor_, mapFooter_, mapCanvas_) {
    var dif = contenedor_.innerHeight() - mapFooter_.outerHeight();
    mapCanvas_.height(dif);

    //me encargo del cambio de tamaño del mapa
    contenedor_.bind('resized', function (e) {
      var dif = contenedor_.innerHeight() - mapFooter_.outerHeight();
      mapCanvas_.height(dif);
      google.maps.event.trigger(contenedor_.data().gmap, "resize");
    });

  };

  /**
   * Info de la proyección:
   *  - http://spatialreference.org/ref/user/google-projection/
   *  Cacho de código canibalizado de
   *  http://www.koders.com/javascript/fid6E870FE86135B30197CF121CF8ED16F4416B2588.aspx?s=wms
   *
   * Proj4 Text:
   *     +proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0
   *     +k=1.0 +units=m +nadgrids=@null +no_defs
   *
   * WKT:
   *     900913=PROJCS["WGS84 / Simple Mercator", GEOGCS["WGS 84",
   *     DATUM["WGS_1984", SPHEROID["WGS_1984", 6378137.0, 298.257223563]], 
   *     PRIMEM["Greenwich", 0.0], UNIT["degree", 0.017453292519943295], 
   *     AXIS["Longitude", EAST], AXIS["Latitude", NORTH]],
   *     PROJECTION["Mercator_1SP_Google"], 
   *     PARAMETER["latitude_of_origin", 0.0], PARAMETER["central_meridian", 0.0], 
   *     PARAMETER["scale_factor", 1.0], PARAMETER["false_easting", 0.0], 
   *     PARAMETER["false_northing", 0.0], UNIT["m", 1.0], AXIS["x", EAST],
   *     AXIS["y", NORTH], AUTHORITY["EPSG","900913"]]
   */
  argenmap.latLngAMercator = function (lat, lon) {
    var x = lon * 20037508.34 / 180;
    var y = Math.log(Math.tan((90 + lat) * Math.PI / 360)) / (Math.PI / 180);

    y = y * 20037508.34 / 180;

    return {
      lat: y,
      lng: x
    };
  };

  //-----------------------------------------------------------------------//
  // jQuery event
  //-----------------------------------------------------------------------//
  //resized event: se escucha desde un DOMElement y se dispara
  //cada vez que ese elemento cambia de tamanio (ancho o alto)
  $.event.special.resized = {
    interval:0,
    setup: function () {
      var self = this,
        $this = $(this);
      var $w = $this.width();
      var $h = $this.height();
      $.event.special.resized.interval = setInterval(function () {
        if ($w !== $this.width() || $h !== $this.height()) {
          $w = $this.width();
          $h = $this.height();
          jQuery.event.handle.call(self, {
            type: 'resized'
          });
        }
      }, 100);
    },
    teardown: function () {
      clearInterval($.event.special.resized.interval);
    }
  };


  //-----------------------------------------------------------------------//
  // argenmap.jQuery plugin
  //-----------------------------------------------------------------------//

  $.fn.argenmap = function (opciones) {
    var i, args,
      results = [];

    // loop on each jQuery object
    $.each(this, function () {
      var _argenmap = $(this).data('argenmap');
      if (!_argenmap) {
        _argenmap = new Argenmap(this, opciones);
        $(this).data('argenmap', _argenmap);
        _argenmap.init();
      }

    });
    // return for direct call (only) 
    if (results.length) {
      if (results.length === 1) { // 1 css selector
        return results[0];
      } else {
        return results;
      }
    }

    return this;
  };

  $.fn.agregarCapaBaseWMS = function (opciones) {
    //chainability
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      var map = $(this).data('gmap');

      argenmap.GmapAgregarCapaBase(map, new argenmap.CapaBaseWMS({
        name: opciones.nombre,
        baseURL: opciones.url,
        layers: opciones.capas
      }));
    });
  };

  $.fn.agregarCapaBaseTMS = function (opciones) {
    //chainability
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      var map = $(this).data('gmap');

      argenmap.GmapAgregarCapaBase(map, new argenmap.CapaBaseTMS({
        name: opciones.nombre,
        baseURL: opciones.url,
        layers: opciones.capas
      }));
    });
  };

  $.fn.agregarCapaWMS = function (opciones) {
    //chainability
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      var map = $(this).data('gmap');

      argenmap.GmapAgregarCapa(map, new argenmap.CapaWMS({
        name: opciones.nombre,
        baseURL: opciones.url,
        layers: opciones.capas
      }));
    });
  };

  $.fn.agregarCapaTMS = function (opciones) {
    //chainability
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      var map = $(this).data('gmap');

      argenmap.GmapAgregarCapaTMS(map, new argenmap.CapaTMS({
        name: opciones.nombre,
        baseURL: opciones.url,
        layers: opciones.capas
      }));
    });
  };

  $.fn.agregarCapaKML = function (opciones) {
    //chainability
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      a.agregarCapaKML( opciones );
    });
  };

  $.fn.centro = function (lat, lng) {
    //getter
    //el getter/lector solo devuelve la primer coincidencia de selector
    if (arguments.length === 0) {
      if (!this.data('argenmap')) {
        return [];
    }

      var ctro = this.data('gmap').getCenter();
      return ctro ? [ctro.lat(), ctro.lng()] : [];
    }
    //setter
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      $(this).data('gmap').setCenter(new google.maps.LatLng(lat, lng));
    });
  };

  $.fn.zoom = function (zoom) {
    if (undefined === zoom) {
      if (!this.data('argenmap')) {
        return null;  
      }
      var z = this.data('gmap').getZoom();
      return z ? z : null;
    }
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a || !$.isNumeric(zoom)) {
        return;
      }
      $(this).data('gmap').setZoom(zoom);

    });
  };

  $.fn.capaBase = function (nombre) {
    if (undefined === nombre) {
      if (!this.data('argenmap')) {
        return null;
      }
      var z = this.data('gmap').mapTypeId;
      return z ? z : null;
    }
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }

      $(this).data('gmap').setMapTypeId(nombre);
    });
  };

  /**
   * Agrega un marcador al mapa instanciado en el selector
   * agregarMarcador(float,float)
   * agregarMarcador(objeto): {lonlat:OpenLayers.LonLat} ó {lon:float,lat:float}
   * agregarMarcador(string): "-35,-57"
   * Opciones:
   *   capa: string, nombre de la capa donde colocar el marcador
   *   contenido: string/HTML, contenido descriptivo del marcador
   *   nombre: string
   *   eventos: TO DO
   *   cuadro: objeto con opciones de cuadro (ver agregarCuadro)
   */
  $.fn.agregarMarcador = function (opciones) {
    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      a.agregarMarcador(opciones);
    });
  };

  $.fn.agregarMarcadores = function (marcadores) {
    return this.each(function () {
      var _this = this;
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      $(marcadores).each( function (i, v) {
        $(_this).agregarMarcador(v);
      });
    });
  };

  $.fn.limpiarMapa = function (marcadores) {

    return this.each(function () {
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      $(this).argenmap({
        accion: 'limpiar'
      });

    });

  };
  $.fn.quitarMarcador = function(nombre) {
    var _nombre = nombre;
    return this.each(function(i,e){
      if(typeof(_nombre) !== 'string') {
        return;
      }
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      a.quitarMarcador(_nombre);
    });
  };
  $.fn.modificarMarcador = function(nombre, opciones) {
    var _nombre = nombre;
    var _opciones = opciones;
    return this.each(function(i,e){
      if(typeof(_nombre) !== 'string') {
        return;
      } 
      if(_opciones === undefined || typeof(_opciones) !== 'object') {
        return;
      }
      var a = $(this).data('argenmap');
      if (!a) {
        return;
      }
      a.modificarMarcador(_nombre,_opciones);
    });
  };

  $.fn.encuadrar = function (encuadre) {
    return this.each(function () {
      var a = $(this).data('argenmap');
      $(this).data('argenmap').encuadrar(encuadre);
    });
  }; 

})(jQuery);
