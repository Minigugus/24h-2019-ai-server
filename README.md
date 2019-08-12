# 24h 2019 - AI Server

## Building

```console
npm run build
```

## Running

```console
npm start [MAP_PATH]
```
where `[MAP_PATH]` is the path to the PPM image corresponding to the map to use, eg. `./examples/echo_server.ppm`.

### Generate a map

```console
node examples/generate.js > your_randomly_generated_map.ppm
```

## Example

```
$ npm run build
$ npm start ./examples/echo_server.ppm

> 24h_2019_ai_server@0.1.0 start
> node dist/index.js "./examples/echo_server.ppm"

Lobby created on UDP port 8000. Waiting for players...
          
          
  ##  ##  
# ##  ## #
#  #  #  #
#  #  #  #
# #    # #
#  ####  #
##      ##
####  ####
```

## License

MIT
