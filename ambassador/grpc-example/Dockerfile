FROM python:2.7-slim

WORKDIR /grpc

ENV PATH "$PATH:/grpc"

COPY greeter_server.py /grpc
COPY helloworld_pb2.py /grpc
COPY helloworld_pb2_grpc.py /grpc

RUN python -m pip install grpcio
RUN python -m pip install grpcio-tools googleapis-common-protos

CMD ["python", "./greeter_server.py"]

EXPOSE 50051