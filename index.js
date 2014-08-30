'use strict';

var noble = require('noble');
var scan = require('./scan');
var _ = require('lodash');

function Plugin(messenger, options){
  this.messenger = messenger;
  this.options = options;
  this.peripherals = [];
  return this;
}

var optionsSchema = {
  type: 'object',
  properties: {
  }
};

var messageSchema = {
  type: 'object',
  properties: {
    scan: {
      type: 'object',
      required: false,
      properties: {
        serviceUuids: {
          type: 'string, array',
          required: true
        }
      }
    },
    connect: {
      type: 'object',
      required: false,
      properties: {
        uuid: {
          type: 'string',
          required: true
        },
        serviceUuid: {
          type: 'string',
          required: true
        }
      }
    },
    read: {
      type: 'object',
      required: false,
      properties: {
        characteristicUuid: {
          type: 'string',
          required: true
        },
        serviceUuid: {
          type: 'string',
          required: true
        }
      }
    },
    write: {
      type: 'object',
      required: false,
      properties: {
        characteristicUuid: {
          type: 'string',
          required: true
        },
        serviceUuid: {
          type: 'string',
          required: true
        },
        value: {
          type: 'array',
          required: true
        }
      }
    }
  }
};

Plugin.prototype.onMessage = function(msg, fn){
  var self = this;

  console.log('msg', msg);

  var payload = msg.payload;

  if(payload && payload.scan){
    self.peripherals = [];
    console.log('start scan', payload);
    scan(payload.scan.timeout || 5000, payload.scan.serviceUuids, self.peripherals, function(peripherals){
      console.log('finished scanning', peripherals);
      if(fn){
        peripherals = peripherals.map(function(peripheral){
          var p = _.clone(peripheral);
          delete p._noble;
          return p;
        });
        fn(peripherals);
      }
    });
  }

  if(payload && payload.connect){
    if(self.peripherals.length){
      console.log('checking already scanned peripherals', payload.connect);
      self.peripherals.forEach(function(peripheral){

        if(peripheral.uuid === payload.connect.uuid){
          console.log('matching peripheral found', peripheral.uuid);
          peripheral.connect(function(){
            peripheral.discoverServices([payload.connect.serviceUuid], function(err, services){
              if (err && fn){
                fn({error: err});
              }
              else{
                self.peripheral = peripheral;
                fn({status: 'connected', uuid: peripheral.uuid});
              }
            });
          });
        }
      });
    }else{
      self.peripherals = [];
      console.log('start scan for connect', payload.connect);
      scan(payload.connect.timeout || 5000, payload.connect.serviceUuid, self.peripherals, function(peripherals){
        peripherals.forEach(function(peripheral){
          console.log('matching peripheral found', peripheral.uuid);
          if(peripheral.uuid === msg.payload.connect.uuid){
            peripheral.connect(function(){
              peripheral.discoverServices([msg.payload.connect.serviceUuid], function(err, services){
                if (err && fn){
                  fn({error: err});
                }
                else{
                  self.peripheral = peripheral;
                  fn({status: 'connected', uuid: peripheral.uuid});
                }
              });
            });
          }
        });
      });
    }
  }

  if(payload && payload.read && fn){
    if(self.peripheral){
      self.peripheral.discoverServices([payload.read.serviceUuid], function(error, services) {
        var deviceInformationService = services[0];
        console.log('discovered device service for read');
        deviceInformationService.discoverCharacteristics([payload.read.characteristicUuid], function(error, characteristics) {
          if(error){
            console.log('error discovering characteristics', error);
            fn({error: error});
          }else{
            var manufacturerNameCharacteristic = characteristics[0];
            console.log('discovered manufacturer characteristic for read', characteristics);

            manufacturerNameCharacteristic.read(function(error, data) {
              // data is a buffer
              console.log('value is: ', data, typeof data);
              if(fn){
                fn(data);
              }
            });
          }
        });
      });
    }else{
      if(fn){
        fn({error: 'not connected'});
      }
    }
  }

  if(payload && payload.write){
    if(self.peripheral){
      self.peripheral.discoverServices([payload.write.serviceUuid], function(error, services) {
        var deviceInformationService = services[0];
        console.log('discovered device service for write');
        deviceInformationService.discoverCharacteristics([payload.write.characteristicUuid], function(error, characteristics) {
          var manufacturerNameCharacteristic = characteristics[0];
          console.log('discovered manufacturer characteristic for write');

          manufacturerNameCharacteristic.write(new Buffer(payload.write.value), false, function(error) {
            if(fn){
              if(error){
                fn({error: error});
              }
              else{
                fn({status: 'written', characteristicUuid: payload.write.characteristicUuid});
              }
            }
          });
        });
      });
    }else{
      if(fn){
        fn({error: 'not connected'});
      }
    }
  }

};

Plugin.prototype.destroy = function(){
  //clean up
  console.log('destroying.', this.options);
};


module.exports = {
  Plugin: Plugin,
  optionsSchema: optionsSchema,
  messageSchema: messageSchema
};
